// Connectivity smoke test — run with:  pnpm smoke   (node --env-file=.env)
//
// A browser can't be driven headlessly here, so this proves the SAME client
// config the app uses (URI + key + the bundled pipe) actually authenticates
// and reaches the server. Uses validate() only — no LLM, no credits.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RocketRideClient } from 'rocketride';

const PIPE_PATH = fileURLToPath(new URL('../../../pipelines/payment_fraud_sentinel_v2.pipe', import.meta.url));
const PIPE = JSON.parse(readFileSync(PIPE_PATH, 'utf8'));

const uri = process.env.ROCKETRIDE_URI;
const auth = process.env.ROCKETRIDE_APIKEY;
if (!uri || !auth) {
	console.error('FAIL: ROCKETRIDE_URI / ROCKETRIDE_APIKEY not set (copy .env.example to .env)');
	process.exit(1);
}

const client = new RocketRideClient({ uri, auth, persist: true, onEvent: () => {} });

try {
	await client.connect(auth);
	console.log('connect     :', client.isConnected() ? 'OK' : 'NOT CONNECTED');
	console.log('pipe        :', PIPE.components.length, 'nodes | project_id', String(PIPE.project_id).slice(0, 8));

	let allClean = true;
	for (const source of ['webhook_invoice', 'webhook_verify', 'webhook_feedback', 'webhook_chat']) {
		const r = await client.validate({ pipeline: PIPE, source });
		const errs = r?.errors ?? [];
		const warns = r?.warnings ?? [];
		const ok = Array.isArray(errs) && errs.length === 0;
		allClean &&= ok;
		console.log(`validate ${source.padEnd(16)}: ${ok ? 'OK' : 'ERRORS ' + JSON.stringify(errs)}  (warnings ${warns.length})`);
	}

	console.log(allClean && client.isConnected() ? '\nSMOKE: PASS' : '\nSMOKE: FAIL');
	process.exitCode = allClean && client.isConnected() ? 0 : 1;
} catch (e) {
	console.error('SMOKE: FAIL —', e?.message || e);
	process.exitCode = 1;
} finally {
	await client.disconnect().catch(() => {});
}
