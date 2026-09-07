/**
 * Deterministic synthetic vendor-master generator for Payment Fraud Sentinel.
 *
 *   node scripts/gen_vendors.mjs          # print a summary
 *   node scripts/gen_vendors.mjs --emit   # (re)write scripts/vendors_seed.sql + scripts/vendors_seed.json
 *
 * No network, no SDK, no credentials. The 50 records are generated from a fixed
 * seed, so every run produces the identical set. Import { generateVendors,
 * VENDOR_DDL } from this module in the live seeder.
 *
 * NOTE: these 50 records were not specified earlier in the project — they are
 * synthesised here and shaped to exercise the v2 pipeline logic:
 *   - ~6 vendors first-seen < 30 days ago      (new-vendor branch of the HOLD rule)
 *   - 4 vendors with deliberately thin history (mean-based "2x" rule edge cases)
 *   - every 9th vendor carries one ~3.4x outlier invoice
 *   - risk_score spread: most 3-26, three 45-70, two 82-94
 *   - risk_history depth scales with risk_score (+1 entry for new vendors)
 * Swap generateVendors() for a real dataset loader when you have one; the DDL
 * and the column list stay the same.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// --- column list mirrors rocketride_sql_vendors.db_description in v2 --------

export const VENDOR_COLUMNS = [
	'vendor_id',
	'name',
	'known_bank_accounts',
	'historical_invoice_amounts',
	'first_seen_date',
	'risk_score',
	'risk_history',
];

export const VENDOR_DDL = {
	postgres: `CREATE TABLE IF NOT EXISTS vendors (
  vendor_id                  TEXT PRIMARY KEY,
  name                       TEXT NOT NULL,
  known_bank_accounts        JSONB    NOT NULL DEFAULT '[]'::jsonb,
  historical_invoice_amounts JSONB    NOT NULL DEFAULT '[]'::jsonb,
  first_seen_date            DATE     NOT NULL,
  risk_score                 INTEGER  NOT NULL DEFAULT 0,
  risk_history               JSONB    NOT NULL DEFAULT '[]'::jsonb
);`,
	mysql: `CREATE TABLE IF NOT EXISTS vendors (
  vendor_id                  VARCHAR(64)  PRIMARY KEY,
  name                       VARCHAR(255) NOT NULL,
  known_bank_accounts        JSON         NOT NULL,
  historical_invoice_amounts JSON         NOT NULL,
  first_seen_date            DATE         NOT NULL,
  risk_score                 INT          NOT NULL DEFAULT 0,
  risk_history               JSON         NOT NULL
);`,
};

// --- deterministic RNG ----------------------------------------------------

function mulberry32(seed) {
	return function () {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const CORE = [
	'Northwind', 'Contoso', 'Fabrikam', 'Tailspin', 'Wingtip', 'Proseware', 'Litware',
	'Adventure Works', 'Coho', 'Fourth Coffee', 'Humongous', 'Lucerne', 'Margies',
	'Trey', 'Woodgrove', 'Blue Yonder', 'City Power', 'Consolidated', 'First Up',
	'Alpine Ski', 'Southridge', 'Tru-Fit', 'VanArsdel', 'Relecloud', 'Bellows',
	'Fincher', 'Parnell', 'Wide World', 'Graphic Design Institute', 'Nod Publishers',
];
const KIND = ['Traders', 'Logistics', 'Supplies', 'Industries', 'Services', 'Partners',
	'Manufacturing', 'Consulting', 'Distribution', 'Solutions', 'Holdings', 'Systems'];
const SUFFIX = ['Inc', 'LLC', 'Corp', 'Co', 'Group', 'GmbH', 'Ltd'];
const RH_EVENTS = ['onboarding_review', 'periodic_review', 'human_review', 'bank_change_verified', 'aml_screen'];

const DAY = 86400000;
const TODAY = new Date('2026-08-26T00:00:00Z');
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const money = (n) => Math.round(n * 100) / 100;

const NEW_VENDOR_IDX = new Set([7, 18, 29, 33, 41, 47]);
const MID_RISK_IDX = new Set([12, 25, 38]);
const HIGH_RISK_IDX = new Set([4, 44]);
const THIN_HISTORY_IDX = new Set([7, 15, 29, 41]);

export function generateVendors() {
	const rnd = mulberry32(20260826);
	const pick = (a) => a[Math.floor(rnd() * a.length)];
	const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

	const bankAccount = () => {
		const s = rnd();
		if (s < 0.5) return `ACH-****${int(1000, 9999)}`;
		if (s < 0.8) return `WIRE-****${int(1000, 9999)}`;
		return `IBAN-DE**${int(10, 99)}****${int(1000, 9999)}`;
	};

	const vendors = [];
	for (let i = 0; i < 50; i++) {
		const vendor_id = `V${String(i + 1).padStart(4, '0')}`;
		const name = `${pick(CORE)} ${pick(KIND)} ${pick(SUFFIX)}`;

		const first = NEW_VENDOR_IDX.has(i)
			? new Date(TODAY.getTime() - int(3, 27) * DAY)
			: new Date(TODAY.getTime() - int(120, 1600) * DAY);

		const known_bank_accounts = Array.from({ length: int(1, 3) }, bankAccount);

		const histCount = THIN_HISTORY_IDX.has(i) ? int(1, 3) : int(6, 18);
		const base = int(900, 42000);
		const historical_invoice_amounts = Array.from({ length: histCount }, () =>
			money(base * (0.55 + rnd() * 0.95)),
		);
		if (i % 9 === 0 && historical_invoice_amounts.length > 3) {
			historical_invoice_amounts[historical_invoice_amounts.length - 1] = money(base * 3.4);
		}

		let risk_score;
		if (HIGH_RISK_IDX.has(i)) risk_score = int(82, 94);
		else if (MID_RISK_IDX.has(i)) risk_score = int(45, 70);
		else risk_score = int(3, 26);

		const rhCount = Math.min(4, Math.floor(risk_score / 22) + (NEW_VENDOR_IDX.has(i) ? 1 : 0));
		const risk_history = [];
		for (let k = 0; k < rhCount; k++) {
			const when = new Date(first.getTime() + int(1, 90) * DAY * (k + 1));
			const reject = rnd() < risk_score / 130;
			risk_history.push({
				date: iso(when > TODAY ? TODAY : when),
				event: k === 0 ? 'onboarding_review' : pick(RH_EVENTS),
				decision: reject ? 'reject' : 'approve',
				note: reject
					? 'Flagged: remittance detail mismatch, held for manual verification.'
					: 'Cleared after review; no action required.',
			});
		}

		vendors.push({
			vendor_id,
			name,
			known_bank_accounts,
			historical_invoice_amounts,
			first_seen_date: iso(first),
			risk_score,
			risk_history,
		});
	}
	return vendors;
}

// --- SQL emitter --------------------------------------------------------

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const jsonb = (v) => `${q(JSON.stringify(v))}::jsonb`;

export function toPostgresSql(vendors) {
	const rows = vendors.map(
		(v) =>
			`  (${q(v.vendor_id)}, ${q(v.name)}, ${jsonb(v.known_bank_accounts)}, ` +
			`${jsonb(v.historical_invoice_amounts)}, ${q(v.first_seen_date)}, ${v.risk_score}, ${jsonb(v.risk_history)})`,
	);
	return `-- Payment Fraud Sentinel — vendor-master seed (Postgres). Generated by scripts/gen_vendors.mjs — do not edit by hand.
-- Idempotent: re-running upserts the same 50 rows.

${VENDOR_DDL.postgres}

INSERT INTO vendors
  (vendor_id, name, known_bank_accounts, historical_invoice_amounts, first_seen_date, risk_score, risk_history)
VALUES
${rows.join(',\n')}
ON CONFLICT (vendor_id) DO UPDATE SET
  name                       = EXCLUDED.name,
  known_bank_accounts        = EXCLUDED.known_bank_accounts,
  historical_invoice_amounts = EXCLUDED.historical_invoice_amounts,
  first_seen_date            = EXCLUDED.first_seen_date,
  risk_score                 = EXCLUDED.risk_score,
  risk_history               = EXCLUDED.risk_history;
`;
}

// --- CLI --------------------------------------------------------------

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const vendors = generateVendors();
	const here = dirname(fileURLToPath(import.meta.url));

	if (process.argv.includes('--emit')) {
		writeFileSync(resolve(here, 'vendors_seed.json'), JSON.stringify(vendors, null, 2) + '\n');
		writeFileSync(resolve(here, 'vendors_seed.sql'), toPostgresSql(vendors));
		console.log('wrote scripts/vendors_seed.json and scripts/vendors_seed.sql');
	}

	const newV = vendors.filter((v) => (Date.now() - Date.parse(v.first_seen_date)) < 30 * DAY);
	console.log(`generated ${vendors.length} vendors`);
	console.log(`  first-seen < 30 days: ${newV.length}  (${newV.map((v) => v.vendor_id).join(', ')})`);
	console.log(`  risk_score >= 45    : ${vendors.filter((v) => v.risk_score >= 45).map((v) => v.vendor_id).join(', ')}`);
	console.log('  sample row:', JSON.stringify(vendors[0]));
}
