// Steps 1 + 2: publish v1 to @team/Production, then submit v1 for @public review.
// Run from repo root:  node --env-file=.env apps/paymentFraudSentinel-standalone/scripts/publish_team_and_submit.mjs

import { RocketRideClient } from 'rocketride';

const APP_ID = 'payment_fraud_sentinel.paymentFraudSentinel';
const VERSION = 1;
const URI = process.env.ROCKETRIDE_DEPLOY_URI;
const KEY = process.env.ROCKETRIDE_DEPLOY_APIKEY;
if (!URI || !KEY) { console.error('FAIL: ROCKETRIDE_DEPLOY_* not in env'); process.exit(1); }

const httpBase = URI.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:').replace(/\/task\/service\/?$/i, '').replace(/:443(?=\/|$)/, '').replace(/\/+$/, '');
const client = new RocketRideClient({ uri: URI, auth: KEY, env: { ROCKETRIDE_URI: URI, ROCKETRIDE_APIKEY: KEY }, onEvent: () => {} });

try {
	const who = await client.connect(KEY);
	console.log('connected as       :', who?.email, '| org:', who?.organization?.name);
	console.log('teams              :', (who?.organization?.teams || []).map((t) => `${t.name}(${t.id})`).join(', '));

	// ---- Step 1: publish to @team/Production ----
	console.log('\n--- step 1: publishApp -> @team/Production ---');
	let pub;
	try {
		pub = await client.publishApp(APP_ID, VERSION, '@team/Production');
		console.log('publish OK         :', JSON.stringify(pub?.publish ?? pub));
	} catch (e) {
		console.log('publish by name failed:', e.message, '\n  retrying with team id…');
		pub = await client.publishApp(APP_ID, VERSION, '@team/bb9d09d1-a579-46df-bc94-3e85039eb3b6');
		console.log('publish OK (by id) :', JSON.stringify(pub?.publish ?? pub));
	}

	// ---- Step 2: submit for @public review ----
	console.log('\n--- step 2: submitApp (v1 -> @public review queue) ---');
	try {
		const sub = await client.submitApp(APP_ID, VERSION);
		console.log('submit OK          :', JSON.stringify(sub?.artifact ?? sub));
	} catch (e) {
		console.log('submit result      :', e.message);
	}

	// ---- report where it's live now ----
	const where = await client.whereApp(APP_ID);
	console.log('\nwhereApp           :', JSON.stringify(where, null, 2));
	const rail = await client.listDeployments(APP_ID);
	console.log('v1 state           :', JSON.stringify(rail?.[0] && { v: rail[0].registryVersion, state: rail[0].state, buildStatus: rail[0].buildStatus, rungs: rail[0].rungs }));

	console.log('\n================ URLS ================');
	console.log(`Team (judges) : ${httpBase}/?appid=${APP_ID}`);
	console.log(`Pinned to v1  : ${httpBase}/?appid=${APP_ID}&version=1`);
	console.log('=====================================');
} catch (e) {
	console.error('\nthrew:', e?.message || String(e));
	if (e?.stack) console.error(e.stack);
	process.exit(1);
} finally {
	await client.disconnect().catch(() => {});
}
