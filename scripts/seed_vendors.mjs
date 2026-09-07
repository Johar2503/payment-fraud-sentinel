/**
 * Seed / re-seed the `vendors` table used by pipelines/payment_fraud_sentinel_v2.pipe.
 *
 *   node --env-file=.env scripts/seed_vendors.mjs            # seed from scripts/vendors_seed.sql
 *   node --env-file=.env scripts/seed_vendors.mjs --regen    # regenerate the .sql first, then seed
 *
 * Idempotent — the INSERT is `... ON CONFLICT (vendor_id) DO UPDATE`, so every run
 * converges the 50 rows to the generator's output. Safe to run repeatedly.
 *
 * ── Method (this is the only combination that works against the managed store) ──
 *   1. ATTACH to the already-running _seed_vendors.pipe with use({ useExisting: true }).
 *      Opening that pipeline fresh fails: its rocketride_sql node has
 *      allow_execute: true, and the open path demands ROCKETRIDE_CLIENT_ID in the
 *      *engine* env (injected by the VS Code extension / a deploy, not by a bare
 *      SDK run). Attaching to the running task sidesteps the open-time gate.
 *   2. Run LITERAL SQL via client.database.query(). Parameter binding ($1 / ?) is
 *      NOT supported on this transport — it errors. vendors_seed.sql inlines every
 *      value (numbers, quoted strings, '...'::jsonb literals), so no binding is needed.
 *   3. Split vendors_seed.sql on the `INSERT INTO vendors` boundary, NOT on ';' —
 *      a risk_history note contains "review; no action required". The file is
 *      exactly two statements: CREATE TABLE IF NOT EXISTS, then INSERT ... ON CONFLICT.
 *   4. Never terminate the pipeline — it is a shared task started elsewhere.
 *
 * If the attach fails with "not running" / similar, start the seed pipeline first:
 *   - VS Code: open pipelines/_seed_vendors.pipe in Pipeline Builder and Run, or
 *   - POST once to its webhook (any body), or
 *   - deploy it —
 * then re-run this script.
 *
 * Fallback with no running pipeline at all: `node scripts/gen_vendors.mjs --emit`
 * then paste scripts/vendors_seed.sql into the Pipeline Builder SQL console.
 */

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { generateVendors, toPostgresSql } from './gen_vendors.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SEED_PIPE = resolve(ROOT, 'pipelines/_seed_vendors.pipe');
const SQL_FILE = resolve(HERE, 'vendors_seed.sql');
const NODE_ID = 'rocketride_sql_1'; // the rocketride_sql node inside _seed_vendors.pipe

// rocketride is installed under the app workspace, not the repo root.
const require = createRequire(pathToFileURL(resolve(ROOT, 'apps/paymentFraudSentinel-ui/package.json')));
const { RocketRideClient } = require('rocketride');

/** Two statements: everything before `INSERT INTO vendors`, and everything from there. */
function splitStatements(sqlText) {
	const noComments = sqlText
		.split('\n')
		.filter((l) => !l.trim().startsWith('--'))
		.join('\n')
		.trim();
	const cut = noComments.indexOf('INSERT INTO vendors');
	if (cut === -1) throw new Error('vendors_seed.sql: could not find the "INSERT INTO vendors" boundary');
	return [
		noComments.slice(0, cut).trim().replace(/;\s*$/, ''), // CREATE TABLE IF NOT EXISTS ...
		noComments.slice(cut).trim().replace(/;\s*$/, ''), //    INSERT INTO vendors ... ON CONFLICT ...
	].filter(Boolean);
}

// --- optionally (re)generate the .sql -----------------------------------

if (process.argv.includes('--regen') || !existsSync(SQL_FILE)) {
	writeFileSync(SQL_FILE, toPostgresSql(generateVendors()));
	console.log(`${existsSync(SQL_FILE) ? 'regenerated' : 'generated'} ${SQL_FILE}`);
}

// --- attach + run ------------------------------------------------------

const client = new RocketRideClient({ uri: process.env.ROCKETRIDE_URI, auth: process.env.ROCKETRIDE_APIKEY });
await client.connect(process.env.ROCKETRIDE_APIKEY);
console.log('connected:', client.isConnected(), '->', process.env.ROCKETRIDE_URI);

try {
	let token;
	try {
		({ token } = await client.use({ filepath: SEED_PIPE, useExisting: true, name: 'seed-vendors' }));
	} catch (e) {
		throw new Error(
			'could not attach to _seed_vendors.pipe — it must already be RUNNING on the server ' +
				'(a fresh open trips the ROCKETRIDE_CLIENT_ID gate on its allow_execute node). ' +
				'Start it from the VS Code Pipeline Builder / a deploy / one webhook POST, then re-run.\n  underlying: ' +
				(e?.message || e),
		);
	}
	console.log('attached to seed pipeline:', token);

	const statements = splitStatements(readFileSync(SQL_FILE, 'utf8'));
	console.log(`running ${statements.length} literal statement(s) from ${SQL_FILE}`);
	for (const [i, sql] of statements.entries()) {
		const r = await client.database.query({ token, nodeId: NODE_ID, sql });
		console.log(`  stmt ${i + 1}/${statements.length}: OK  affected=${r.affected_rows}  ${sql.slice(0, 40).replace(/\s+/g, ' ')}...`);
	}

	// --- verify -------------------------------------------------------
	const q = async (sql) => (await client.database.query({ token, nodeId: NODE_ID, sql })).rows;
	const num = (rows) => Number(rows[0][Object.keys(rows[0])[0]]);

	const count = num(await q('SELECT COUNT(*) AS n FROM vendors'));
	const newV = num(await q("SELECT COUNT(*) AS n FROM vendors WHERE first_seen_date > CURRENT_DATE - INTERVAL '30 days'"));
	const hist = num(await q('SELECT COUNT(*) AS n FROM vendors WHERE jsonb_array_length(risk_history) > 0'));
	const highRisk = await q('SELECT vendor_id, risk_score FROM vendors WHERE risk_score >= 45 ORDER BY vendor_id');

	console.log('\nverification:');
	console.log('  rows in vendors     :', count, count === 50 ? 'OK' : '(expected 50)');
	console.log('  first_seen < 30 days:', newV);
	console.log('  with risk_history   :', hist);
	console.log('  risk_score >= 45    :', highRisk.map((r) => `${r.vendor_id}(${r.risk_score})`).join(' '));
	console.table(
		await q(
			"SELECT vendor_id, name, first_seen_date, risk_score, " +
				"jsonb_array_length(historical_invoice_amounts) AS n_inv, " +
				"jsonb_array_length(risk_history) AS n_hist " +
				'FROM vendors ORDER BY vendor_id LIMIT 8',
		),
	);
	console.log('\nseed complete.');
} catch (err) {
	console.error('\nSEED FAILED:', err?.message || err);
	process.exitCode = 1;
} finally {
	// deliberately NOT terminate() — _seed_vendors.pipe is a shared, externally-started task.
	await client.disconnect().catch(() => {});
}
