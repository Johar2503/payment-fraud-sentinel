// Diagnostic: one invoice through webhook_invoice with full tracing + every
// event logged, so the REAL underlying LLM error surfaces (the pipeline result
// only shows RocketRide's generic "An error occurred with the API" wrapper).
//
//   node --env-file=.env scripts/trace_invoice_probe.mjs [test-data/invoices/clean_01.txt]

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
	...(V.VITE_ROCKETRIDE_GROQ_KEY ? { ROCKETRIDE_GROQ_KEY: V.VITE_ROCKETRIDE_GROQ_KEY } : {}),
	...(V.VITE_ROCKETRIDE_GEMINI_KEY ? { ROCKETRIDE_GEMINI_KEY: V.VITE_ROCKETRIDE_GEMINI_KEY } : {}),
	...(V.VITE_ROCKETRIDE_ANTHROPIC_KEY ? { ROCKETRIDE_ANTHROPIC_KEY: V.VITE_ROCKETRIDE_ANTHROPIC_KEY } : {}),
};

const name = basename(FILE);
const file = new File([readFileSync(FILE)], name, { type: 'text/plain' });

const seen = [];
const client = new RocketRideClient({
	uri: ENV.ROCKETRIDE_URI,
	auth: ENV.ROCKETRIDE_APIKEY,
	env: ENV,
	persist: true,
	onEvent: (ev) => {
		try {
			const s = JSON.stringify(ev);
			// keep only events that mention an error / the llm nodes / api
			if (/error|exception|llm_|api|groq|traceback|429|400|token/i.test(s)) {
				seen.push(s.length > 1200 ? s.slice(0, 1200) + '…' : s);
			}
		} catch {}
	},
});

let token;
try {
	await client.connect(ENV.ROCKETRIDE_APIKEY);
	console.log('connected');

	if (PROJECT_ID) {
		const stale = await client.getTaskToken({ projectId: PROJECT_ID, source: 'webhook_invoice' }).catch(() => undefined);
		if (stale) await client.terminate(stale).catch(() => {});
	}

	const started = await client.use({
		pipeline: PIPE,
		source: 'webhook_invoice',
		ttl: 600,
		name: `trace probe ${name}`,
		pipelineTraceLevel: 'full',
		args: ['--trace=debugOut'],
	});
	token = started.token;
	console.log('task open:', token ? 'acquired' : 'FAILED');

	const [r] = await client.sendFiles([{ file, mimetype: 'text/plain' }], token);

	console.log('\n===== result keys =====');
	console.log(Object.keys(r?.result ?? {}));

	console.log('\n===== pending_review (full) =====');
	console.log(JSON.stringify(r?.result?.pending_review, null, 2));

	if (r?.result?._trace) {
		console.log('\n===== _trace (invoke calls / errors) =====');
		const t = JSON.stringify(r.result._trace);
		console.log(t.length > 6000 ? t.slice(0, 6000) + '…[truncated]' : t);
	}

	console.log('\n===== matched events (' + seen.length + ') =====');
	for (const s of seen.slice(-40)) console.log(s, '\n');
} catch (e) {
	console.error('threw:', e?.message || String(e));
	console.error(e?.stack);
} finally {
	if (token) await client.terminate(token).catch(() => {});
	await client.disconnect().catch(() => {});
}
