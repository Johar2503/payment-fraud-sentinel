/**
 * Batch runner for payment_fraud_sentinel_v2 — pushes a folder of invoice
 * files through the webhook_invoice source and reports a triage summary.
 *
 *   node scripts/run_batch.mjs --pilot                  # stratified 15-invoice sample
 *   node scripts/run_batch.mjs                           # all files, sequential
 *   node scripts/run_batch.mjs --pool=5                  # 5-way concurrent (see below)
 *   node scripts/run_batch.mjs --limit=30 --pool=4
 *
 * Flags:
 *   --dir=PATH        invoice folder                 (default test-data/invoices)
 *   --pilot          stratified 15 across every category (implies --probe)
 *   --limit=N         first N files (after stratification if --pilot)
 *   --pool=N          run N invoices at once. The engine refuses a second
 *                     concurrent `use()` of the SAME pipeline ("Pipeline is
 *                     already running"), so concurrency needs N clones of the
 *                     .pipe each with a fresh project_id. This flag writes them
 *                     to <scratch>/pool/ and gives one clone to each worker.
 *                     Without it the run is sequential (concurrency 1).
 *   --probe          probe pass + contamination check before the rest
 *   --timeout=SEC     per-invoice ceiling            (default 300)
 *
 * Isolation: one fresh `client.use({ ttl: 0 })` task per invoice, terminated as
 * soon as its invoice returns (the shared long-lived task merges results across
 * sendFiles calls — that was the contamination bug). The pre-existing UI task
 * (project 15ef2833-…) is never touched; pool clones get brand-new project_ids.
 */

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const require = createRequire(pathToFileURL(resolve(ROOT, 'apps/paymentFraudSentinel-ui/package.json')).href);
const { RocketRideClient } = require('rocketride');

const SCRATCH =
	'C:/Users/johar/AppData/Local/Temp/claude/c--Users-johar-Desktop-RocketRide/f5a703a1-e7d6-442e-85a0-56ae695f61aa/scratchpad';
const V2 = resolve(ROOT, 'pipelines/payment_fraud_sentinel_v2.pipe');

// --- args ---------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name, def) => {
	const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
	if (!hit) return def;
	const eq = hit.indexOf('=');
	return eq === -1 ? true : hit.slice(eq + 1);
};
const DIR = resolve(ROOT, String(flag('dir', 'test-data/invoices')));
const PILOT = !!flag('pilot', false);
const LIMIT = flag('limit', null) != null ? Number(flag('limit', null)) : null;
const POOL = flag('pool', null) != null ? Math.max(1, Number(flag('pool', null))) : 1;
let CONCURRENCY = POOL;
const PROBE = PILOT || !!flag('probe', false);
const TIMEOUT_MS = Number(flag('timeout', 300)) * 1000;

// --- pool of pipe clones (one per worker lane) ------------------------

function buildPool(n) {
	if (n <= 1) return [V2];
	const src = JSON.parse(readFileSync(V2, 'utf8'));
	const poolDir = `${SCRATCH}/pool`;
	mkdirSync(poolDir, { recursive: true });
	const paths = [];
	for (let i = 0; i < n; i++) {
		const clone = { ...src, project_id: randomUUID() };
		const p = `${poolDir}/pfs_v2_pool${i}.pipe`;
		writeFileSync(p, JSON.stringify(clone, null, 2));
		paths.push(p);
	}
	return paths;
}
const POOL_PIPES = buildPool(POOL);

// --- invoice selection ------------------------------------------------

const manifest = JSON.parse(readFileSync(resolve(DIR, '_manifest.json'), 'utf8'));
const byName = new Map(manifest.map((m) => [m.file, m]));
const allFiles = readdirSync(DIR)
	.filter((f) => f.endsWith('.txt'))
	.sort();

const PILOT_PLAN = {
	clean: 5,
	fraud_full_hold: 3,
	suspicious_bank_change: 2,
	suspicious_amount_outlier: 1,
	suspicious_new_vendor: 1,
	malformed: ['malformed_01_empty.txt', 'malformed_07_garbled_ocr.txt', 'malformed_12_json_blob.txt'],
};

function selectFiles() {
	const explicit = flag('files', null);
	if (explicit) {
		const want = String(explicit).split(',').map((s) => s.trim()).filter(Boolean);
		return want.filter((f) => allFiles.includes(f));
	}
	if (!PILOT) {
		const picked = [...allFiles];
		return LIMIT != null ? picked.slice(0, LIMIT) : picked;
	}
	// one bucket per category, in PILOT_PLAN order
	const buckets = Object.entries(PILOT_PLAN).map(([cat, spec]) =>
		Array.isArray(spec) ? [...spec] : allFiles.filter((f) => byName.get(f)?.category === cat).slice(0, spec),
	);
	// round-robin interleave so a small --limit still spans every category
	// (fraud + malformed included) instead of taking a flat head slice
	const picked = [];
	for (let round = 0; picked.length < buckets.reduce((n, b) => n + b.length, 0); round++) {
		for (const b of buckets) if (b[round]) picked.push(b[round]);
	}
	return LIMIT != null ? picked.slice(0, LIMIT) : picked;
}

// --- result parsing (mirrors app src/lib/pipeline.ts array contract) ---

function parsePendingReview(result) {
	const raw = result?.pending_review;
	const arr = Array.isArray(raw) ? raw : [raw];
	for (const item of [...arr].reverse()) {
		let obj = item;
		if (typeof item === 'string') {
			try {
				obj = JSON.parse(item.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim());
			} catch {
				continue;
			}
		}
		if (obj && typeof obj === 'object' && 'queue_status' in obj && 'vendor' in obj) return obj;
	}
	return null;
}

const invoiceNoFromText = (txt) => (txt.match(/Invoice Number:\s*(\S+)/i) || [, null])[1];

// Best-effort scan for real LLM usage. Deliberately strict: only exact,
// well-known key names count, and cost is only trusted when it sits next to a
// token count — otherwise unrelated numeric fields (ranking weights, seq ids)
// get mistaken for a dollar figure.
function scrapeUsage(node, acc) {
	if (!node || typeof node !== 'object') return acc;
	const tokenKeys = new Set(['input_tokens', 'output_tokens', 'prompt_tokens', 'completion_tokens', 'total_tokens']);
	for (const [k, v] of Object.entries(node)) {
		if (typeof v === 'number' && tokenKeys.has(k)) {
			acc.tokens[k] = (acc.tokens[k] || 0) + v;
			acc.found = true;
		}
		if (v && typeof v === 'object') {
			const hasTok = Object.keys(v).some((kk) => tokenKeys.has(kk));
			if (hasTok && typeof v.cost === 'number') acc.costUsd += v.cost;
			scrapeUsage(v, acc);
		}
	}
	return acc;
}

// --- pool runner: each lane keeps a stable index -> its own pipe clone -

const STAGGER_MS = Number(flag('stagger', 4)) * 1000; // delay between lane cold-starts

async function runLanes(items, laneCount, worker) {
	const results = new Array(items.length);
	let next = 0;
	const lane = async (laneIdx) => {
		if (STAGGER_MS) await new Promise((r) => setTimeout(r, laneIdx * STAGGER_MS));
		while (true) {
			const i = next++;
			if (i >= items.length) return;
			results[i] = await worker(items[i], laneIdx, i);
		}
	};
	await Promise.all(Array.from({ length: Math.min(laneCount, items.length) }, (_, k) => lane(k)));
	return results;
}

async function waitConnected(ms = 30000) {
	const t0 = Date.now();
	while (!client.isConnected() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 500));
	return client.isConnected();
}

async function useWithRetry(opts, tries = 4) {
	let lastErr;
	for (let k = 0; k < tries; k++) {
		try {
			return await client.use(opts);
		} catch (e) {
			lastErr = e;
			const msg = e?.message || String(e);
			if (!/not connected|Connection closed|ECONN|socket/i.test(msg)) throw e;
			await waitConnected(20000);
			await new Promise((r) => setTimeout(r, 3000 * (k + 1)));
		}
	}
	throw lastErr;
}

// --- client ----------------------------------------------------------

const EVENTS = [];
const client = new RocketRideClient({
	uri: process.env.ROCKETRIDE_URI,
	auth: process.env.ROCKETRIDE_APIKEY,
	persist: true,
	onEvent: (e) => EVENTS.push({ t: Date.now(), event: e?.event, body: e?.body }),
	onDisconnected: () => process.stdout.write('  ! disconnected (persist reconnects)\n'),
});

async function processInvoice(fileName, laneIdx) {
	const pipePath = POOL_PIPES[laneIdx % POOL_PIPES.length];
	const meta = byName.get(fileName) || { file: fileName, category: 'unknown', expected_queue: null, expects_hold: null };
	const bytes = readFileSync(resolve(DIR, fileName));
	const text = bytes.toString('utf8');
	const rec = {
		file: fileName,
		category: meta.category,
		expected_queue: meta.expected_queue,
		expects_hold: meta.expects_hold,
		lane: laneIdx,
		sent_invoice_no: invoiceNoFromText(text),
		token: null,
		object_id: null,
		queue_status: null,
		deterministic_hold: null,
		rules_fired: null,
		parsed_invoice_no: null,
		risk_level: null,
		secs: null,
		status: 'ok',
		error: null,
	};

	// Cheap pre-pipeline guard: a 0-byte or whitespace-only upload can't yield a
	// facts document, so extract_facts emits nothing and the agent has no Step 0
	// input to inspect. Skip the run entirely rather than burn ~70s of retries.
	if (text.trim().length < 8) {
		rec.secs = 0;
		rec.status = 'skipped_empty';
		rec.error = `empty/near-empty upload (${text.trim().length} non-space chars) — not submitted`;
		process.stdout.write(`  L${laneIdx} ${fileName.padEnd(26)}      -  SKIPPED_EMPTY\n`);
		return rec;
	}

	const t0 = Date.now();
	try {
		const used = await useWithRetry({ filepath: pipePath, name: `batch-${fileName}`, ttl: 0, pipelineTraceLevel: 'full' });
		rec.token = used.token;
		await client.addMonitor({ token: rec.token }, ['flow', 'output', 'task']).catch(() => {});

		const file = new File([bytes], fileName, { type: 'text/plain' });
		const send = client.sendFiles(
			[{ file, mimetype: 'text/plain', objinfo: { filepath: `${DIR}/${fileName}` } }],
			rec.token,
		);
		const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS));
		const [res] = await Promise.race([send, timeout]);
		send.catch(() => {});

		rec.secs = +((Date.now() - t0) / 1000).toFixed(1);
		if (res?.error) {
			rec.status = 'error';
			rec.error = String(res.error);
		} else {
			rec.object_id = res?.result?.objectId ?? null;
			const c = parsePendingReview(res?.result);
			if (!c) {
				rec.status = 'no_parse';
				rec.error = 'no parseable pending_review case';
			} else {
				rec.queue_status = c.queue_status ?? null;
				rec.deterministic_hold = c.deterministic_hold ?? null;
				rec.rules_fired = c.rules_fired ?? [];
				rec.parsed_invoice_no = c?.invoice?.invoice_number ?? null;
				rec.risk_level = c?.risk?.risk_level ?? null;
			}
		}
	} catch (e) {
		rec.secs = +((Date.now() - t0) / 1000).toFixed(1);
		rec.status = e?.message === 'timeout' ? 'timeout' : 'error';
		rec.error = e?.message || String(e);
	} finally {
		if (rec.token) await client.terminate(rec.token).catch(() => {});
	}

	const tag =
		rec.status === 'ok'
			? `${rec.queue_status}${rec.deterministic_hold ? ' +HOLD' : ''}`
			: rec.status.toUpperCase();
	process.stdout.write(
		`  L${laneIdx} ${fileName.padEnd(26)} ${String(rec.secs).padStart(6)}s  ${tag}${rec.error ? '  (' + rec.error + ')' : ''}\n`,
	);
	return rec;
}

// --- summary -------------------------------------------------------

const pct = (n, d) => (d ? ((100 * n) / d).toFixed(0) + '%' : '—');
function quantile(sorted, q) {
	if (!sorted.length) return null;
	const pos = (sorted.length - 1) * q;
	const base = Math.floor(pos);
	const rest = pos - base;
	return +(sorted[base] + (sorted[base + 1] !== undefined ? rest * (sorted[base + 1] - sorted[base]) : 0)).toFixed(1);
}

function printSummary(records, wallSecs, label) {
	const ok = records.filter((r) => r.status === 'ok');
	const skipped = records.filter((r) => r.status === 'skipped_empty');
	const bad = records.filter((r) => r.status !== 'ok' && r.status !== 'skipped_empty');
	const q = (s) => ok.filter((r) => r.queue_status === s).length;
	const times = records.map((r) => r.secs).filter((n) => typeof n === 'number').sort((a, b) => a - b);
	const sum = times.reduce((a, b) => a + b, 0);
	const usage = scrapeUsage({ EVENTS }, { tokens: {}, costUsd: 0, found: false });

	console.log(`\n${'='.repeat(74)}\n  BATCH SUMMARY${label ? ' — ' + label : ''}\n${'='.repeat(74)}`);
	console.log(`  files selected         ${records.length}`);
	console.log(`  completed ok           ${ok.length}`);
	console.log(`  skipped (empty upload) ${skipped.length}`);
	console.log(`  errored / timed out    ${bad.length}`);
	console.log(`  ${'-'.repeat(70)}`);
	console.log(`  auto_cleared           ${q('auto_cleared')}`);
	console.log(`  pending_review         ${q('pending_review')}`);
	console.log(`  auto_hold              ${q('auto_hold')}`);
	const other = ok.filter((r) => !['auto_cleared', 'pending_review', 'auto_hold'].includes(r.queue_status));
	if (other.length) console.log(`  other queue_status     ${other.length}  (${[...new Set(other.map((r) => r.queue_status))].join(', ')})`);
	console.log(`  deterministic HOLD     ${ok.filter((r) => r.deterministic_hold === true).length}`);
	console.log(`  ${'-'.repeat(70)}`);
	console.log(
		`  per-invoice time       avg ${times.length ? (sum / times.length).toFixed(1) : '—'}s   median ${quantile(times, 0.5) ?? '—'}s   p95 ${quantile(times, 0.95) ?? '—'}s   min ${times[0] ?? '—'}s   max ${times[times.length - 1] ?? '—'}s`,
	);
	console.log(`  wall-clock             ${wallSecs.toFixed(1)}s   (pool ${POOL}, effective concurrency ${CONCURRENCY})`);
	console.log(`  ${'-'.repeat(70)}`);
	if (usage.found) {
		console.log(`  tokens (from trace)    ${JSON.stringify(usage.tokens)}`);
		console.log(`  cost (from trace)      $${usage.costUsd.toFixed(4)}`);
	} else {
		console.log(`  tokens / cost          NOT exposed by this deployment's traces`);
		console.log(`                         flow events carry only Document.tokens (chunk size); no LLM`);
		console.log(`                         usage/cost field is emitted. Check the RocketRide billing`);
		console.log(`                         dashboard for the window ${new Date(Date.now() - wallSecs * 1000).toISOString()} .. now.`);
	}
	console.log(`  ${'-'.repeat(70)}`);

	const scored = ok.filter((r) => r.category !== 'malformed' && r.category !== 'unknown');
	const match = scored.filter((r) => r.queue_status === r.expected_queue);
	console.log(`  expected-vs-actual     ${match.length}/${scored.length} matched heuristic expectation (${pct(match.length, scored.length)})`);
	const holdCases = ok.filter((r) => r.category === 'fraud_full_hold');
	const holdFired = holdCases.filter((r) => r.deterministic_hold === true && r.queue_status === 'auto_hold');
	console.log(`  full-HOLD scenarios    ${holdFired.length}/${holdCases.length} -> auto_hold + deterministic_hold=true`);
	const mism = scored.filter((r) => r.queue_status !== r.expected_queue);
	if (mism.length) {
		console.log(`  mismatches:`);
		for (const r of mism) console.log(`    ${r.file.padEnd(28)} expected ${r.expected_queue}  got ${r.queue_status}`);
	}
	const malformed = records.filter((r) => r.category === 'malformed');
	const mDeg = malformed.filter((r) => r.status === 'ok');
	const mSkip = malformed.filter((r) => r.status === 'skipped_empty');
	const mErr = malformed.length - mDeg.length - mSkip.length;
	console.log(`  malformed inputs       ${malformed.length} selected — ${mSkip.length} skipped pre-pipeline, ${mDeg.length} degraded to a queue_status, ${mErr} errored/timed-out`);
	for (const r of malformed) console.log(`    ${r.file.padEnd(28)} ${r.status === 'ok' ? r.queue_status : r.status.toUpperCase()}${r.error ? '  (' + r.error + ')' : ''}`);
	if (bad.length) {
		console.log(`  ${'-'.repeat(70)}\n  failures:`);
		for (const r of bad) console.log(`    ${r.file.padEnd(28)} ${r.status.toUpperCase().padEnd(8)} ${r.error || ''}`);
	}
	console.log(`${'='.repeat(74)}\n`);
}

function contaminationCheck(records) {
	const problems = [];
	const ids = records.map((r) => r.object_id).filter(Boolean);
	if (new Set(ids).size !== ids.length) problems.push('duplicate objectId across concurrent tasks');
	for (const r of records) {
		if (r.status !== 'ok' || r.category === 'malformed') continue;
		if (r.sent_invoice_no && r.parsed_invoice_no && r.sent_invoice_no !== r.parsed_invoice_no)
			problems.push(`${r.file}: sent ${r.sent_invoice_no} but result carried ${r.parsed_invoice_no}`);
	}
	return problems;
}

// --- main ----------------------------------------------------------

(async () => {
	await client.connect(process.env.ROCKETRIDE_APIKEY);
	console.log(`connected: ${client.isConnected()}`);
	const files = selectFiles();
	console.log(`invoice dir: ${DIR}`);
	console.log(`pool: ${POOL} clone(s)${POOL > 1 ? ' -> ' + POOL_PIPES.map((p) => p.split('/').pop()).join(', ') : ' (sequential, original pipe)'}`);
	console.log(`selected ${files.length} file(s)${PILOT ? ' (stratified pilot)' : ''}, timeout ${TIMEOUT_MS / 1000}s/invoice\n`);

	const started = Date.now();
	let records = [];
	try {
		if (PROBE && files.length > POOL && POOL > 1) {
			const probeN = POOL;
			console.log(`--- concurrency probe: ${probeN} invoices across ${probeN} pool clones ---`);
			const p0 = Date.now();
			const probeRecs = await runLanes(files.slice(0, probeN), probeN, processInvoice);
			const probeSecs = (Date.now() - p0) / 1000;
			const problems = contaminationCheck(probeRecs);
			const errs = probeRecs.filter((r) => r.status !== 'ok' && r.status !== 'skipped_empty').length;
			const seqEst = probeRecs.reduce((a, r) => a + (r.secs || 0), 0);
			console.log(`\n  probe wall-clock ${probeSecs.toFixed(1)}s for ${probeN} concurrent  (~${seqEst.toFixed(0)}s if run one-by-one)`);
			if (problems.length) {
				console.log(`  PROBE FAILED — contamination:`);
				for (const p of problems) console.log(`    - ${p}`);
				CONCURRENCY = 1;
				console.log(`  -> falling back to sequential on pool clone 0 for the remainder\n`);
			} else if (errs > probeN / 2) {
				CONCURRENCY = Math.max(1, Math.floor(POOL / 2));
				console.log(`  probe: no contamination but ${errs}/${probeN} errored -> concurrency ${CONCURRENCY} for the remainder\n`);
			} else {
				console.log(`  PROBE PASSED — distinct objectIds, invoice numbers matched, ${errs} error(s). Concurrency ${CONCURRENCY}\n`);
			}
			records = probeRecs;
			const rest = files.slice(probeN);
			if (rest.length) {
				console.log(`--- remaining ${rest.length} invoices at concurrency ${CONCURRENCY} ---`);
				records = records.concat(await runLanes(rest, CONCURRENCY, processInvoice));
			}
		} else {
			console.log(`--- ${files.length} invoices at concurrency ${CONCURRENCY} ---`);
			records = await runLanes(files, CONCURRENCY, processInvoice);
		}
	} finally {
		const wallSecs = (Date.now() - started) / 1000;
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		try {
			writeFileSync(
				`${SCRATCH}/batch_results_${stamp}.json`,
				JSON.stringify({ dir: DIR, pilot: PILOT, pool: POOL, concurrency: CONCURRENCY, wallSecs, records }, null, 2),
			);
			writeFileSync(`${SCRATCH}/batch_events_${stamp}.json`, JSON.stringify(EVENTS, null, 2));
			console.log(`\nper-invoice records -> ${SCRATCH}/batch_results_${stamp}.json`);
			console.log(`raw events (${EVENTS.length}) -> ${SCRATCH}/batch_events_${stamp}.json`);
		} catch (e) {
			console.log(`could not write result files: ${e?.message || e}`);
		}
		if (records.length) printSummary(records, wallSecs, PILOT ? 'PILOT' : `${records.length} invoices`);
		await client.disconnect().catch(() => {});
		console.log('done.');
	}
})().catch((e) => {
	console.error('FATAL:', e?.stack || e?.message || e);
	process.exitCode = 1;
});
