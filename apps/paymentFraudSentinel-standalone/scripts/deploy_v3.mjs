// Deploy the Option-B App Builder app as a new version, publish to @me + @team/Production.
// Run from repo root: node --env-file=.env apps/paymentFraudSentinel-standalone/scripts/deploy_v2.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RocketRideClient } from 'rocketride';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(HERE, '../../..');
const APP_ROOT = path.join(WORKSPACE_ROOT, 'apps', 'paymentFraudSentinel-ui');
const APP_ID = 'payment_fraud_sentinel.paymentFraudSentinel';

const URI = process.env.ROCKETRIDE_DEPLOY_URI;
const KEY = process.env.ROCKETRIDE_DEPLOY_APIKEY;
if (!URI || !KEY) { console.error('FAIL: ROCKETRIDE_DEPLOY_* missing'); process.exit(1); }
const httpBase = URI.replace(/^wss?:/i, (m) => (m[0] === 'w' ? 'https:' : m)).replace(/^ws:/i, 'http:').replace(/\/task\/service\/?$/i, '').replace(/:443(?=\/|$)/, '').replace(/\/+$/, '');

const client = new RocketRideClient({ uri: URI, auth: KEY, env: { ROCKETRIDE_URI: URI, ROCKETRIDE_APIKEY: KEY }, onEvent: () => {} });
try {
	const v = await client.deploy.verifyApp(APP_ROOT, { workspaceRoot: WORKSPACE_ROOT });
	console.log('verifyApp.ok:', v.ok, '| files:', v.fileCount, '| bytes:', v.uncompressedBytes);
	for (const c of v.checks) if (!c.ok) console.log('  BAD', c.id, c.note);
	if (!v.ok) { console.error('ABORT: verifyApp failed'); process.exit(1); }

	const who = await client.connect(KEY);
	console.log('connected as:', who?.email, '| org:', who?.organization?.name);

	console.log('\n--- addApp ---');
	await client.deploy.addApp(APP_ROOT, {
		workspaceRoot: WORKSPACE_ROOT,
		comment: `v3 — hide SQL/Python code disclosures + est. cost note from UI (CaseDetail/SubmitView) (${new Date().toISOString().slice(0, 16)}Z)`,
		onProgress: (l) => { const s = typeof l === 'string' ? l : JSON.stringify(l); if (/pack complete|check include|packing \d/.test(s)) console.log('  ' + s); },
	});

	console.log('\n--- server build ---');
	let latest;
	for (let i = 0; i < 120; i++) {
		const rail = await client.listDeployments(APP_ID);
		latest = rail?.[0];
		const st = latest?.buildStatus ?? 'pending';
		process.stdout.write(`  v${latest?.registryVersion} buildStatus=${st}   \r`);
		if (st && !['building', 'pending'].includes(st)) break;
		await new Promise((r) => setTimeout(r, 4000));
	}
	console.log('');
	console.log(`build: v${latest.registryVersion} -> ${latest.buildStatus}`);
	if (latest.buildStatus !== 'ok') {
		try { console.error((await client.buildLog(APP_ID, latest.registryVersion)).log); } catch {}
		process.exit(1);
	}

	for (const target of ['@me', '@team/Production']) {
		const r = await client.publishApp(APP_ID, latest.registryVersion, target);
		console.log(`publish ${target.padEnd(16)} -> v${r?.publish?.version ?? latest.registryVersion} (${r?.publish?.state ?? 'ok'})`);
	}

	console.log('\nwhereApp:', JSON.stringify(await client.whereApp(APP_ID), null, 1));
	console.log('\n============================');
	console.log(`v${latest.registryVersion} live at: ${httpBase}/?appid=${APP_ID}`);
	console.log(`pinned:          ${httpBase}/?appid=${APP_ID}&version=${latest.registryVersion}`);
	console.log('============================');
} catch (e) {
	console.error('\nthrew:', e?.message || String(e));
	if (e?.stack) console.error(e.stack);
	process.exit(1);
} finally {
	await client.disconnect().catch(() => {});
}
