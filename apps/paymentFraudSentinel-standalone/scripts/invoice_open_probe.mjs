// Task-OPEN-ONLY probe for the ROCKETRIDE_CLIENT_ID fix on the invoice flow.
//
// Reproduces src/lib/pipeline.ts submitInvoices() UP TO — but NOT including —
// client.sendFiles(). That means:
//   - terminate any stale webhook_invoice task (same as submitInvoices)
//   - client.use({ source: 'webhook_invoice' })  <-- the line the server
//     rejects with "ROCKETRIDE_CLIENT_ID is not set" when the id is missing
//   - inspect the result, then terminate immediately
//
// No document is sent, so no extraction / vendor lookup / risk LLM runs.
// Cost profile is the same pre-LLM ~$0.00 as feedback_probe's task open.
//
// The env map is built EXACTLY as src/lib/rrClient.tsx builds it: only the
// VITE_-prefixed values, remapped to ROCKETRIDE_* keys, including
// ROCKETRIDE_CLIENT_ID <- VITE_ROCKETRIDE_CLIENT_ID. config.env replaces
// process.env entirely, so this only passes if the fix is real.
//
// Run:  node --env-file=.env scripts/invoice_open_probe.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RocketRideClient } from 'rocketride';

const PIPE_PATH = fileURLToPath(new URL('../../../pipelines/payment_fraud_sentinel_v2.pipe', import.meta.url));
const PIPE = JSON.parse(readFileSync(PIPE_PATH, 'utf8'));
const PROJECT_ID = String(PIPE.project_id ?? '');

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

const CLIENT_ID_ERR = /ROCKETRIDE_CLIENT_ID is not set|require(?:s)? a signed-in|cloud identity/i;
const AUTH_ERR = /password authentication failed|role "rocketride"|user "rocketride"/i;

const client = new RocketRideClient({ uri: ENV.ROCKETRIDE_URI, auth: ENV.ROCKETRIDE_APIKEY, env: ENV, persist: true, onEvent: () => {} });
let token;
try {
	await client.connect(ENV.ROCKETRIDE_APIKEY);
	console.log('connect            :', client.isConnected() ? 'OK' : 'NOT CONNECTED');

	// Same stale-task cleanup submitInvoices() does before its per-file use().
	if (PROJECT_ID) {
		const stale = await client.getTaskToken({ projectId: PROJECT_ID, source: 'webhook_invoice' }).catch(() => undefined);
		if (stale) {
			await client.terminate(stale).catch(() => {});
			console.log('stale invoice task :', 'terminated');
		}
	}

	const t0 = Date.now();
	const started = await client.use({ pipeline: PIPE, source: 'webhook_invoice', ttl: 60, name: 'invoice open probe (no files)' });
	const dt = Date.now() - t0;
	token = started.token;
	const blob = JSON.stringify(started);

	console.log(`\ntask open          : ${token ? 'acquired' : 'NO TOKEN'}  (${dt}ms)`);
	console.log('response (trunc)   :', blob.length > 1000 ? blob.slice(0, 1000) + ' …[truncated]' : blob);

	const clientIdMissing = CLIENT_ID_ERR.test(blob);
	const authFailed = AUTH_ERR.test(blob);
	console.log('\nCLIENT_ID warning  :', clientIdMissing ? 'YES — still present' : 'no');
	console.log('DB auth error      :', authFailed ? 'YES' : 'no');

	if (token && !clientIdMissing && !authFailed) {
		console.log('\nINVOICE OPEN PROBE: PASS — webhook_invoice task opened with CLIENT_ID accepted.');
		process.exitCode = 0;
	} else {
		console.log('\nINVOICE OPEN PROBE: FAIL — see flags above.');
		process.exitCode = 1;
	}
} catch (e) {
	const m = e?.message || String(e);
	console.error('\nthrew              :', m);
	console.error('error name         :', e?.name);
	console.error('error keys         :', e && typeof e === 'object' ? Object.keys(e).join(', ') : '(not object)');
	for (const k of ['code', 'status', 'reason', 'detail', 'body', 'response', 'data', 'cause']) {
		if (e && e[k] !== undefined) {
			try { console.error(`error.${k}       :`, typeof e[k] === 'object' ? JSON.stringify(e[k]) : String(e[k])); } catch { /* noop */ }
		}
	}
	try { console.error('error JSON         :', JSON.stringify(e, Object.getOwnPropertyNames(e || {}))); } catch { /* noop */ }
	console.error('stack              :', e?.stack);
	if (CLIENT_ID_ERR.test(m)) console.error('INVOICE OPEN PROBE: FAIL (CLIENT_ID still not set at task open)');
	else if (AUTH_ERR.test(m)) console.error('INVOICE OPEN PROBE: FAIL (DB password auth error)');
	else console.error('INVOICE OPEN PROBE: ERROR (other failure — see above)');
	process.exitCode = 1;
} finally {
	if (token) await client.terminate(token).catch(() => {});
	await client.disconnect().catch(() => {});
}
