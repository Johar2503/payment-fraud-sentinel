// One-shot LIVE cheap verification for the ROCKETRIDE_CLIENT_ID fix.
//
// No browser automation is available, so this faithfully reproduces the
// standalone app's decision path (src/lib/pipeline.ts sendDecision):
//   - build RocketRideClient with an EXPLICIT env map, exactly the transform
//     src/lib/rrClient.tsx now performs: read the VITE_-prefixed vars the
//     browser bundle sees, remap to ROCKETRIDE_* keys, INCLUDING
//     ROCKETRIDE_CLIENT_ID <- VITE_ROCKETRIDE_CLIENT_ID (the fix).
//     config.env replaces process.env entirely, so this does NOT fall back to
//     an ambient CLIENT_ID — it only passes if the fix is real.
//   - open a fresh webhook_feedback task and send one decision payload, which
//     routes through rocketride_sql_feedback (same managed provider / same
//     CLIENT_ID requirement as the invoice-flow vendor lookup).
//
// Cost: ONE feedback call (~$0.01–0.03, one small SQL-authoring LLM turn).
// Run:  node --env-file=.env scripts/feedback_probe.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RocketRideClient } from 'rocketride';

const PIPE_PATH = fileURLToPath(new URL('../../../pipelines/payment_fraud_sentinel_v2.pipe', import.meta.url));
const PIPE = JSON.parse(readFileSync(PIPE_PATH, 'utf8'));

// Mirror rrClient.tsx: only the VITE_-prefixed values, remapped to ROCKETRIDE_* keys.
const V = process.env;
const missing = ['VITE_ROCKETRIDE_URI', 'VITE_ROCKETRIDE_APIKEY', 'VITE_ROCKETRIDE_CLIENT_ID'].filter((k) => !V[k]);
if (missing.length) {
	console.error('FAIL: missing in .env ->', missing.join(', '));
	process.exit(1);
}
const ENV = {
	ROCKETRIDE_URI: V.VITE_ROCKETRIDE_URI,
	ROCKETRIDE_APIKEY: V.VITE_ROCKETRIDE_APIKEY,
	...(V.VITE_ROCKETRIDE_ANTHROPIC_KEY ? { ROCKETRIDE_ANTHROPIC_KEY: V.VITE_ROCKETRIDE_ANTHROPIC_KEY } : {}),
	...(V.VITE_ROCKETRIDE_CLIENT_ID ? { ROCKETRIDE_CLIENT_ID: V.VITE_ROCKETRIDE_CLIENT_ID } : {}),
};
console.log('env keys forwarded :', Object.keys(ENV).sort().join(', '));
console.log('CLIENT_ID present  :', 'ROCKETRIDE_CLIENT_ID' in ENV ? `yes (len ${ENV.ROCKETRIDE_CLIENT_ID.length})` : 'NO');

const AUTH_ERR = /password authentication failed|role "rocketride"|user "rocketride"/i;

const client = new RocketRideClient({ uri: ENV.ROCKETRIDE_URI, auth: ENV.ROCKETRIDE_APIKEY, env: ENV, persist: true, onEvent: () => {} });
let token;
try {
	await client.connect(ENV.ROCKETRIDE_APIKEY);
	console.log('connect            :', client.isConnected() ? 'OK' : 'NOT CONNECTED');

	const started = await client.use({ pipeline: PIPE, source: 'webhook_feedback', ttl: 600, name: 'feedback auth probe' });
	token = started.token;
	console.log('task               :', token ? 'acquired' : 'FAILED');

	// Exact shape from pipeline.ts sendDecision():
	const payload = {
		vendor_id: 'V0008',
		vendor_name: 'Tru-Fit Solutions Co',
		invoice_number: 'TFS-2026-0091',
		decision: 'reject',
		event: 'human_review',
		reviewer: 'standalone-reviewer',
		note: 'auth-fix verification probe (CLIENT_ID forwarding)',
		decided_at: new Date().toISOString(),
	};

	const t0 = Date.now();
	const result = await client.send(token, JSON.stringify(payload), undefined, 'text/plain');
	const dt = Date.now() - t0;
	const blob = JSON.stringify(result);
	const authFailed = AUTH_ERR.test(blob);

	console.log(`\nresult keys        : ${Object.keys(result || {}).join(', ')}  (${dt}ms)`);
	console.log('result (truncated) :', blob.length > 1200 ? blob.slice(0, 1200) + ' …[truncated]' : blob);
	console.log('\nauth error present :', authFailed ? 'YES' : 'no');
	console.log(authFailed ? 'FEEDBACK PROBE: FAIL (still password auth error)' : 'FEEDBACK PROBE: PASS (provider authenticated)');
	process.exitCode = authFailed ? 1 : 0;
} catch (e) {
	const m = e?.message || String(e);
	console.error('\nthrew              :', m);
	console.error(AUTH_ERR.test(m) ? 'FEEDBACK PROBE: FAIL (password auth error)' : 'FEEDBACK PROBE: ERROR (other failure — see above)');
	process.exitCode = 1;
} finally {
	if (token) await client.terminate(token).catch(() => {});
	await client.disconnect().catch(() => {});
}
