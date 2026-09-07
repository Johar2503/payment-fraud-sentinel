// One-shot LIVE chat probe — proves App.tsx's chat wiring path end to end.
//
// Mirrors exactly what src/lib/pipeline.ts askAboutCase() does: a fresh
// isolated webhook_chat task, send({ case, question, history }) as text/plain,
// then read chat_answer (reversed answers array, first non-empty string).
//
// Cost: ONE chat call (~$0.02–0.04). Run:  node --env-file=.env scripts/chat_probe.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RocketRideClient } from 'rocketride';

const PIPE_PATH = fileURLToPath(new URL('../../../pipelines/payment_fraud_sentinel_v2.pipe', import.meta.url));
const PIPE = JSON.parse(readFileSync(PIPE_PATH, 'utf8'));

const uri = process.env.ROCKETRIDE_URI;
const auth = process.env.ROCKETRIDE_APIKEY;
if (!uri || !auth) {
	console.error('FAIL: ROCKETRIDE_URI / ROCKETRIDE_APIKEY not set');
	process.exit(1);
}

// A minimal valid PendingCase (trimmed clean sample).
const testCase = {
	queue_status: 'auto_cleared',
	invoice: { invoice_number: 'BY-2026-04417', vendor_name: 'Blue Yonder Systems Inc', amount: '26460.00', currency: 'USD' },
	amount_analysis: { invoice_amount: 26460, vendor_mean_amount: 27518.83, ratio_vs_mean: 0.9615, over_2x_mean: false },
	vendor: { found: true, vendor_id: 'V0003', mean_amount: 27518.83, bank_account_known: true, amount_over_2x_mean: false, days_since_first_seen: 1262 },
	deterministic_hold: false,
	rules_fired: [],
	risk: { risk_score: 10, risk_level: 'low', flags: [{ type: 'unknown_line_item_category', evidence: 'Line item category not recognised (warning only).' }] },
	verification: { status: 'not_required', result: null },
	summary: 'Invoice BY-2026-04417 from Blue Yonder Systems Inc passes all deterministic hold checks; risk low; auto-cleared.',
};

function parseChatAnswer(result) {
	const raw = result?.chat_answer;
	const arr = Array.isArray(raw) ? raw : [raw];
	for (const item of [...arr].reverse()) {
		if (typeof item === 'string' && item.trim()) return item.trim();
		if (item && typeof item === 'object' && typeof item.text === 'string') return item.text.trim();
	}
	return '';
}

const client = new RocketRideClient({ uri, auth, persist: true, onEvent: () => {} });
let token;
try {
	await client.connect(auth);
	console.log('connect :', client.isConnected() ? 'OK' : 'NOT CONNECTED');

	const started = await client.use({ pipeline: PIPE, source: 'webhook_chat', ttl: 600, name: 'chat probe' });
	token = started.token;
	console.log('task    :', token ? 'acquired' : 'FAILED');

	const payload = { case: testCase, question: 'In one sentence, why was this invoice auto-cleared?', history: [] };
	const t0 = Date.now();
	const result = await client.send(token, JSON.stringify(payload), undefined, 'text/plain');
	const answer = parseChatAnswer(result);
	console.log(`answer  : (${Date.now() - t0}ms)\n`, answer || '(EMPTY — parse failed)');
	console.log('\nCHAT PROBE:', answer ? 'PASS' : 'FAIL');
	process.exitCode = answer ? 0 : 1;
} catch (e) {
	console.error('CHAT PROBE: FAIL —', e?.message || e);
	process.exitCode = 1;
} finally {
	if (token) await client.terminate(token).catch(() => {});
	await client.disconnect().catch(() => {});
}
