// One-shot: deploy apps/paymentFraudSentinel-ui to RocketRide staging and
// publish the new version to @me. Uses the DEPLOY pair only.
//
// Run from repo root:
//   node --env-file=.env apps/paymentFraudSentinel-standalone/scripts/deploy_ui_app.mjs
// (.env at repo root must hold ROCKETRIDE_DEPLOY_URI / ROCKETRIDE_DEPLOY_APIKEY)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RocketRideClient } from 'rocketride';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(HERE, '../../..'); // repo root
const APP_ROOT = path.join(WORKSPACE_ROOT, 'apps', 'paymentFraudSentinel-ui');
const APP_ID = 'payment_fraud_sentinel.paymentFraudSentinel';

const URI = process.env.ROCKETRIDE_DEPLOY_URI;
const KEY = process.env.ROCKETRIDE_DEPLOY_APIKEY;
if (!URI || !KEY) {
	console.error('FAIL: ROCKETRIDE_DEPLOY_URI / ROCKETRIDE_DEPLOY_APIKEY not in env');
	process.exit(1);
}

const httpBase = URI.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:')
	.replace(/\/task\/service\/?$/i, '').replace(/\/+$/, '');

const client = new RocketRideClient({ uri: URI, auth: KEY, env: { ROCKETRIDE_URI: URI, ROCKETRIDE_APIKEY: KEY }, onEvent: () => {} });

try {
	// 1. Local precheck (no server call).
	const v = await client.deploy.verifyApp(APP_ROOT, { workspaceRoot: WORKSPACE_ROOT });
	console.log('verifyApp.ok       :', v.ok);
	for (const c of v.checks) console.log(`  [${c.ok ? 'ok ' : 'BAD'}] ${c.id}: ${c.note}`);
	console.log(`  pack: ${v.fileCount} files, ${v.uncompressedBytes} bytes`);
	if (!v.ok) { console.error('\nABORT: verifyApp failed — not deploying.'); process.exit(1); }

	// 2. Connect with the deploy identity.
	const who = await client.connect(KEY);
	console.log('\nconnected as       :', who?.email || who?.displayName, '| org:', who?.organization?.name);

	// 3. Pack + upload source; server builds.
	console.log('\n--- addApp (packing + upload) ---');
	await client.deploy.addApp(APP_ROOT, {
		workspaceRoot: WORKSPACE_ROOT,
		comment: `Payment Fraud Sentinel — staging demo build ${new Date().toISOString().slice(0, 10)}`,
		onProgress: (line) => console.log('  ' + (typeof line === 'string' ? line : JSON.stringify(line))),
	});

	// 4. Poll the version rail for the server build result.
	console.log('\n--- server build ---');
	let latest;
	for (let i = 0; i < 90; i++) {
		const rail = await client.listDeployments(APP_ID);
		latest = rail?.[0];
		const status = latest?.buildStatus ?? '(pending)';
		process.stdout.write(`  v${latest?.registryVersion ?? '?'} buildStatus=${status} state=${latest?.state ?? '?'}\r`);
		if (status && status !== 'building' && status !== 'pending' && status !== '(pending)') break;
		await new Promise((r) => setTimeout(r, 4000));
	}
	console.log('');
	if (!latest) { console.error('ABORT: no deployment row appeared.'); process.exit(1); }
	console.log(`build result       : v${latest.registryVersion} -> buildStatus=${latest.buildStatus}`);

	if (latest.buildStatus !== 'ok') {
		console.error('\nBUILD FAILED — full log:\n');
		try { console.error((await client.buildLog(APP_ID, latest.registryVersion)).log); } catch (e) { console.error('(buildLog unavailable:', e.message, ')'); }
		process.exit(1);
	}

	// 5. Publish to @me.
	console.log('\n--- publishApp -> @me ---');
	const pub = await client.publishApp(APP_ID, latest.registryVersion, '@me');
	console.log('publish            :', JSON.stringify(pub));

	// 6. Where it is live + the URL.
	const where = await client.whereApp(APP_ID);
	console.log('\nwhereApp           :', JSON.stringify(where, null, 2));

	console.log('\n================ LIVE ================');
	console.log(`App id     : ${APP_ID}`);
	console.log(`Version    : v${latest.registryVersion}`);
	console.log(`Rung       : @me  (owner-only)`);
	console.log(`Open in    : ${httpBase}/?appid=${APP_ID}&version=${latest.registryVersion}`);
	console.log(`Base       : ${httpBase}`);
	console.log('=====================================');
} catch (e) {
	console.error('\nthrew:', e?.message || String(e));
	if (e?.stack) console.error(e.stack);
	process.exit(1);
} finally {
	await client.disconnect().catch(() => {});
}
