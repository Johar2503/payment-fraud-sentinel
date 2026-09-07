// ONE real invoice through webhook_invoice via SDK — mirrors pipeline.ts
// submitInvoices() for a single file. Confirms Option B end to end:
//   - Python/agent vendor lookup returns the RIGHT record from embedded VENDOR_MASTER
//   - the agent uses that data (vendor.* fields populated, not fabricated)
//   - no ROCKETRIDE_CLIENT_ID error
// Cost: one full invoice run (extract_facts + agent waves + risk). ~$0.40-0.75.
//
//   node --env-file=.env scripts/one_invoice_probe.mjs [test-data/invoices/clean_01.txt]

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RocketRideClient } from 'rocketride';

const FILE = process.argv[2] || fileURLToPath(new URL('../../../test-data/invoices/clean_01.txt', import.meta.url));
const PIPE = JSON.parse(readFileSync(fileURLToPath(new URL('../../../pipelines/payment_fraud_sentinel_v2.pipe', import.meta.url)), 'utf8'));
const PROJECT_ID = String(PIPE.project_id ?? '');

const V = process.env;
const ENV = {
	ROCKETRIDE_URI: V.VITE_ROCKETRIDE_URI,
	ROCKETRIDE_APIKEY: V.VITE_ROCKETRIDE_APIKEY,
	...(V.VITE_ROCKETRIDE_ANTHROPIC_KEY ? { ROCKETRIDE_ANTHROPIC_KEY: V.VITE_ROCKETRIDE_ANTHROPIC_KEY } : {}),
	...(V.VITE_ROCKETRIDE_GEMINI_KEY ? { ROCKETRIDE_GEMINI_KEY: V.VITE_ROCKETRIDE_GEMINI_KEY } : {}),
	...(V.VITE_ROCKETRIDE_CLIENT_ID ? { ROCKETRIDE_CLIENT_ID: V.VITE_ROCKETRIDE_CLIENT_ID } : {}),
};
const CID_ERR = /ROCKETRIDE_CLIENT_ID is not set|signed-in|cloud identity/i;

const buf = readFileSync(FILE);
const name = basename(FILE);
const file = new File([buf], name, { type: 'text/plain' });

const client = new RocketRideClient({ uri: ENV.ROCKETRIDE_URI, auth: ENV.ROCKETRIDE_APIKEY, env: ENV, persist: true, onEvent: () => {} });
let token;
const t0 = Date.now();
try {
	await client.connect(ENV.ROCKETRIDE_APIKEY);
	console.log('connected      :', client.isAuthenticated());

	if (PROJECT_ID) {
		const stale = await client.getTaskToken({ projectId: PROJECT_ID, source: 'webhook_invoice' }).catch(() => undefined);
		if (stale) { await client.terminate(stale).catch(() => {}); console.log('stale task     : terminated'); }
	}

	const started = await client.use({ pipeline: PIPE, source: 'webhook_invoice', ttl: 600, name: `one-invoice probe ${name}` });
	token = started.token;
	console.log('task open      :', token ? 'acquired' : 'FAILED', `(${Date.now() - t0}ms)`);

	const [r] = await client.sendFiles([{ file, mimetype: 'text/plain' }], token);
	const secs = ((Date.now() - t0) / 1000).toFixed(1);

	if (r?.error) {
		const e = String(r.error);
		console.log('\nsendFiles error:', e);
		console.log(CID_ERR.test(e) ? '\n❌ CLIENT_ID ERROR — Option B did NOT clear the gate' : '\n❌ pipeline error (not CLIENT_ID) — see above');
		process.exitCode = 1;
	} else {
		const result = r?.result ?? {};
		const raw = result.pending_review;
		const arr = Array.isArray(raw) ? raw : [raw];
		let parsed = null;
		for (const item of [...arr].reverse()) {
			try { const o = typeof item === 'string' ? JSON.parse(item.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()) : item; if (o && typeof o === 'object' && 'queue_status' in o) { parsed = o; break; } } catch {}
		}
		console.log(`\nrun complete   : ${secs}s   result keys: ${Object.keys(result).join(', ')}`);
		if (!parsed) {
			console.log('\n❌ no parseable case in pending_review. Raw (truncated):');
			console.log(JSON.stringify(raw).slice(0, 2000));
			process.exitCode = 1;
		} else {
			const v = parsed.vendor || {};
			console.log('\n================ CASE ================');
			console.log('queue_status       :', parsed.queue_status, parsed.unprocessable ? '(unprocessable)' : '');
			console.log('invoice            :', JSON.stringify(parsed.invoice));
			console.log('vendor.found       :', v.found);
			console.log('vendor.vendor_id   :', v.vendor_id, '   (expect V0015)');
			console.log('vendor.bank_known  :', v.bank_account_known, '  (expect true)');
			console.log('vendor.mean_amount :', v.mean_amount, '   (expect ~2897.72)');
			console.log('vendor.days_since  :', v.days_since_first_seen, ' (expect ~1595)');
			console.log('deterministic_hold :', parsed.deterministic_hold, '  (expect false)');
			console.log('rules_fired        :', JSON.stringify(parsed.rules_fired), '   (expect [])');
			console.log('amount_analysis    :', JSON.stringify(parsed.amount_analysis));
			console.log('risk               :', parsed.risk?.risk_level, parsed.risk?.risk_score);
			console.log('summary            :', (parsed.summary || '').slice(0, 200));
			console.log('=====================================');

			const idOk = v.vendor_id === 'V0015';
			const meanOk = v.mean_amount != null && Math.abs(v.mean_amount - 2897.72) < 50;
			const bankOk = v.bank_account_known === true;
			const holdOk = parsed.deterministic_hold === false;
			console.log('\nvendor id correct  :', idOk ? '✅' : '❌');
			console.log('mean ~ correct     :', meanOk ? '✅' : '❌  got ' + v.mean_amount);
			console.log('bank known correct :', bankOk ? '✅' : '❌');
			console.log('hold=false correct :', holdOk ? '✅' : '❌');
			console.log('CLIENT_ID error    :', '✅ none');
			console.log('\n' + (idOk && meanOk && bankOk && holdOk
				? 'PROBE: PASS — embedded vendor lookup works, agent used real data, gate clear.'
				: 'PROBE: PARTIAL — gate is clear but vendor data usage is off (see ❌ above).'));
			process.exitCode = idOk && meanOk && bankOk && holdOk ? 0 : 2;
		}
	}
} catch (e) {
	const m = e?.message || String(e);
	console.error('\nthrew          :', m);
	console.error(CID_ERR.test(m) ? '❌ CLIENT_ID ERROR' : '❌ other failure');
	process.exitCode = 1;
} finally {
	if (token) await client.terminate(token).catch(() => {});
	await client.disconnect().catch(() => {});
}
