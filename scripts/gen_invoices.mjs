/**
 * Deterministic synthetic AP-invoice generator for Payment Fraud Sentinel.
 *
 *   node scripts/gen_invoices.mjs           # print a summary
 *   node scripts/gen_invoices.mjs --emit    # (re)write test-data/invoices/*.txt + _manifest.json
 *
 * No network, no SDK, no credentials. Every invoice is derived from a fixed
 * seed and from the real seeded vendor master (scripts/vendors_seed.json), so
 * the clean / fraud signals line up with what payment_fraud_sentinel_v2's
 * vendor cross-check and deterministic HOLD rule actually look at:
 *
 *   HOLD  = bank account not on file  AND  amount > 2x vendor mean  AND
 *           vendor first seen < 30 days ago
 *
 * Mix (100 files):
 *   65  clean               established vendor, on-file bank, amount near mean   -> expect auto_cleared
 *   22  fraud / suspicious  split across the three HOLD signals:
 *        8  full_hold          new vendor + off-file bank + big amount + urgency -> expect auto_hold
 *        5  bank_change_only   established vendor, off-file bank, normal amount  -> expect pending_review
 *        5  amount_outlier     established vendor, on-file bank, 3-6x amount     -> expect pending_review
 *        4  new_vendor_only    new vendor, on-file bank, normal amount          -> expect pending_review
 *   13  malformed            empty / non-invoice / missing fields / garbled ... -> expect graceful degradation
 *
 * The manifest records the intent of each file so the batch runner can score
 * expected-vs-actual. `expected_queue` is a heuristic — the agent has final say.
 */

import { writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const VENDORS = require('./vendors_seed.json');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', 'test-data', 'invoices');

// --- deterministic RNG (same mulberry32 as gen_vendors.mjs) ----------------

function mulberry32(seed) {
	return function () {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const TODAY = new Date('2026-08-27T00:00:00Z');
const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const money = (n) => (Math.round(n * 100) / 100).toFixed(2);
const withCommas = (s) => String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const amt = (n) => withCommas(money(n));

const BUYERS = [
	'ACME MANUFACTURING CO. — ACCOUNTS PAYABLE',
	'MERIDIAN INDUSTRIAL GROUP — AP DEPARTMENT',
	'HARBOR POINT LOGISTICS — ACCOUNTS PAYABLE',
	'CEDARWORKS FOODS INC — VENDOR PAYMENTS',
	'NORTHGATE FACILITIES LLC — ACCOUNTS PAYABLE',
];

const DESCRIPTIONS = [
	'Quarterly managed analytics platform subscription and standard support',
	'Bulk raw material supply — grade A pellets, 12 pallets',
	'Professional services — Q3 implementation consulting',
	'Annual maintenance contract renewal, tier 2',
	'Freight and customs handling, August shipments',
	'Replacement components and expedited assembly labor',
	'Marketing campaign production and media placement',
	'On-site equipment calibration and certification',
	'Software license true-up, additional seats',
	'Warehouse racking installation, phase 2',
	'Managed security monitoring — monthly retainer',
	'Packaging materials and print run, SKU refresh',
];

const CLEAN_FOOTERS = [
	'Payment terms: Net 30. Remit per existing vendor banking on file. No changes to remittance details.',
	'Net 30. Please remit to the account on file. Banking details unchanged since last invoice.',
	'Terms Net 30. Standard remittance — no updates to payment instructions this cycle.',
];
const BANKCHANGE_FOOTERS = [
	'Please note: our remittance bank has changed. Update to the account shown above for all future payments.',
	'NEW BANKING DETAILS: our previous account is being retired — please pay to the account above going forward.',
	'Our finance team has migrated banks. Kindly update your records to the remit-to account listed here.',
];
const URGENCY_FOOTERS = [
	'URGENT: vendor requests same-day wire to the account listed above. Prior banking details on file are no longer valid — please update the remittance account immediately.',
	'TIME SENSITIVE — expedited same-week delivery already dispatched. Wire full amount today to the new account above; do not use the old account.',
	'Payment required within 24 hours to avoid supply interruption. Remit to the updated account above; previous account is closed.',
];

// --- helpers --------------------------------------------------------------

function vendorMean(v) {
	const a = v.historical_invoice_amounts;
	return a.reduce((s, x) => s + x, 0) / a.length;
}
const daysOld = (v) => Math.round((TODAY - new Date(v.first_seen_date)) / DAY);
const isNew = (v) => daysOld(v) < 30;
const initials = (name) =>
	name
		.split(/\s+/)
		.filter((w) => /^[A-Za-z]/.test(w))
		.slice(0, 3)
		.map((w) => w[0].toUpperCase())
		.join('') || 'INV';

function offFileBank(v, rnd) {
	const known = new Set(v.known_bank_accounts.map((b) => b.toLowerCase()));
	for (let i = 0; i < 50; i++) {
		const cand = `ACH-****${1000 + Math.floor(rnd() * 9000)}`;
		if (!known.has(cand.toLowerCase())) return cand;
	}
	return 'ACH-****0000';
}
const onFileBank = (v, rnd) => v.known_bank_accounts[Math.floor(rnd() * v.known_bank_accounts.length)];

function renderInvoice({ buyer, inv_no, vendor, bank, po, invoice_date, due_date, desc, total, taxRate, footer }) {
	const subtotal = total / (1 + taxRate);
	const tax = total - subtotal;
	const taxLabel = taxRate > 0 ? `Sales Tax (${(taxRate * 100).toFixed(1)}%):` : 'Sales Tax:';
	return [
		buyer,
		'SUPPLIER INVOICE',
		'',
		`Invoice Number: ${inv_no}`,
		`Vendor Name: ${vendor}`,
		`Remit-To Bank Account: ${bank}`,
		`Purchase Order Number: ${po}`,
		`Invoice Date: ${invoice_date}`,
		`Due Date: ${due_date}`,
		'',
		`Line Item: ${desc}`,
		`Subtotal:            ${amt(subtotal)} USD`,
		`${taxLabel}     ${amt(tax)} USD`,
		`Total Amount Due:    ${amt(total)} USD`,
		'Currency: USD',
		'',
		footer,
		'',
	].join('\n');
}

// --- generation ---------------------------------------------------------

export function generateInvoices() {
	const rnd = mulberry32(0x1_9c4_2026);
	const pick = (a) => a[Math.floor(rnd() * a.length)];
	const between = (lo, hi) => lo + rnd() * (hi - lo);

	const established = VENDORS.filter((v) => daysOld(v) >= 45);
	const newVendors = VENDORS.filter(isNew);
	const files = [];
	let seq = 4000;

	const nextNo = (vendor) => `${initials(vendor.name)}-2026-${String(++seq).padStart(4, '0')}`;
	const invDate = (backMax = 20) => {
		const d = new Date(TODAY.getTime() - Math.floor(between(1, backMax)) * DAY);
		return iso(d);
	};
	const addDays = (dateStr, n) => iso(new Date(Date.parse(dateStr) + n * DAY));

	const emit = (name, category, expected_queue, expects_hold, vendor, content, notes) => {
		files.push({
			file: name,
			category,
			expected_queue,
			expects_hold,
			vendor_id: vendor ? vendor.vendor_id : null,
			vendor_name: vendor ? vendor.name : null,
			notes,
			content,
		});
	};

	// -- 65 clean ---------------------------------------------------------
	for (let i = 0; i < 65; i++) {
		const v = established[Math.floor(rnd() * established.length)];
		const mean = vendorMean(v);
		const total = Math.max(250, mean * between(0.6, 1.4));
		const d = invDate(20);
		emit(
			`clean_${String(i + 1).padStart(2, '0')}.txt`,
			'clean',
			'auto_cleared',
			false,
			v,
			renderInvoice({
				buyer: pick(BUYERS),
				inv_no: nextNo(v),
				vendor: v.name,
				bank: onFileBank(v, rnd),
				po: `PO-${10000 + Math.floor(rnd() * 89999)}`,
				invoice_date: d,
				due_date: addDays(d, 30),
				desc: pick(DESCRIPTIONS),
				total,
				taxRate: pick([0.07, 0.075, 0.08, 0.085, 0]),
				footer: pick(CLEAN_FOOTERS),
			}),
			'established vendor, on-file bank, amount within 0.6-1.4x mean',
		);
	}

	// -- 8 full_hold (all three HOLD signals) --------------------------
	for (let i = 0; i < 8; i++) {
		const v = newVendors[i % newVendors.length];
		const mean = vendorMean(v);
		const total = mean * between(2.6, 5.2);
		const d = invDate(6);
		emit(
			`fraud_hold_${String(i + 1).padStart(2, '0')}.txt`,
			'fraud_full_hold',
			'auto_hold',
			true,
			v,
			renderInvoice({
				buyer: pick(BUYERS),
				inv_no: nextNo(v),
				vendor: v.name,
				bank: offFileBank(v, rnd),
				po: '(not provided)',
				invoice_date: d,
				due_date: addDays(d, Math.floor(between(1, 3))),
				desc: 'Emergency bulk procurement — expedited same-week delivery',
				total,
				taxRate: 0,
				footer: pick(URGENCY_FOOTERS),
			}),
			`new vendor (${daysOld(v)}d), off-file bank, ~${(total / mean).toFixed(1)}x mean, urgency`,
		);
	}

	// -- 5 bank_change_only -------------------------------------------
	for (let i = 0; i < 5; i++) {
		const v = established[(i * 7 + 3) % established.length];
		const mean = vendorMean(v);
		const d = invDate(15);
		emit(
			`susp_bankchg_${String(i + 1).padStart(2, '0')}.txt`,
			'suspicious_bank_change',
			'pending_review',
			false,
			v,
			renderInvoice({
				buyer: pick(BUYERS),
				inv_no: nextNo(v),
				vendor: v.name,
				bank: offFileBank(v, rnd),
				po: `PO-${10000 + Math.floor(rnd() * 89999)}`,
				invoice_date: d,
				due_date: addDays(d, 30),
				desc: pick(DESCRIPTIONS),
				total: mean * between(0.8, 1.3),
				taxRate: 0.08,
				footer: pick(BANKCHANGE_FOOTERS),
			}),
			'established vendor, OFF-file bank, normal amount — single signal',
		);
	}

	// -- 5 amount_outlier_only --------------------------------------
	for (let i = 0; i < 5; i++) {
		const v = established[(i * 5 + 11) % established.length];
		const mean = vendorMean(v);
		const total = mean * between(3, 6);
		const d = invDate(15);
		emit(
			`susp_amount_${String(i + 1).padStart(2, '0')}.txt`,
			'suspicious_amount_outlier',
			'pending_review',
			false,
			v,
			renderInvoice({
				buyer: pick(BUYERS),
				inv_no: nextNo(v),
				vendor: v.name,
				bank: onFileBank(v, rnd),
				po: `PO-${10000 + Math.floor(rnd() * 89999)}`,
				invoice_date: d,
				due_date: addDays(d, 30),
				desc: 'One-time capital purchase — production line tooling',
				total,
				taxRate: 0.08,
				footer: pick(CLEAN_FOOTERS),
			}),
			`established vendor, on-file bank, ~${(total / mean).toFixed(1)}x mean — single signal`,
		);
	}

	// -- 4 new_vendor_only ----------------------------------------
	for (let i = 0; i < 4; i++) {
		const v = newVendors[(i + 2) % newVendors.length];
		const mean = vendorMean(v);
		const d = invDate(12);
		emit(
			`susp_newvendor_${String(i + 1).padStart(2, '0')}.txt`,
			'suspicious_new_vendor',
			'pending_review',
			false,
			v,
			renderInvoice({
				buyer: pick(BUYERS),
				inv_no: nextNo(v),
				vendor: v.name,
				bank: onFileBank(v, rnd),
				po: `PO-${10000 + Math.floor(rnd() * 89999)}`,
				invoice_date: d,
				due_date: addDays(d, 30),
				desc: pick(DESCRIPTIONS),
				total: mean * between(0.7, 1.3),
				taxRate: 0.075,
				footer: pick(CLEAN_FOOTERS),
			}),
			`new vendor (${daysOld(v)}d), on-file bank, normal amount — single signal`,
		);
	}

	// -- 13 malformed -------------------------------------------------
	const M = (name, notes, content) => emit(name, 'malformed', 'error_or_degraded', false, null, content, notes);
	M('malformed_01_empty.txt', 'zero-byte file', '');
	M('malformed_02_whitespace.txt', 'whitespace and newlines only', '\n \n\t\n    \n');
	M(
		'malformed_03_memo.txt',
		'internal memo, not an invoice',
		'INTERNAL MEMO\nTo: Facilities\nFrom: Office Manager\nRe: Coffee machine maintenance schedule\n\nThe kitchen coffee machine on floor 3 will be serviced Thursday morning.\nPlease use the floor 2 machine in the meantime. No action required.\n',
	);
	M(
		'malformed_04_recipe.txt',
		'unrelated prose (recipe)',
		'Rustic Sourdough\n\nCombine 500g flour, 350g water, 100g starter, 10g salt.\nAutolyse 45 minutes. Bulk ferment 4 hours with folds every 45 min.\nShape, proof overnight in the fridge, bake at 240C for 30 minutes.\n',
	);
	M(
		'malformed_05_no_amount.txt',
		'invoice shape but no amount anywhere',
		'GLOBEX PARTS CO — ACCOUNTS PAYABLE\nSUPPLIER INVOICE\n\nInvoice Number: GPC-2026-7781\nVendor Name: Globex Parts Co\nRemit-To Bank Account: ACH-****4419\nPurchase Order Number: PO-55123\nInvoice Date: 2026-08-18\nDue Date: 2026-09-17\n\nLine Item: Assorted fasteners and brackets, restock\nCurrency: USD\n\nAmount to be confirmed under separate cover.\n',
	);
	M(
		'malformed_06_no_vendor.txt',
		'invoice shape but vendor name missing',
		'ACME MANUFACTURING CO. — ACCOUNTS PAYABLE\nSUPPLIER INVOICE\n\nInvoice Number: 2026-90042\nRemit-To Bank Account: WIRE-****8830\nInvoice Date: 2026-08-19\nDue Date: 2026-09-18\n\nLine Item: Consulting services rendered\nTotal Amount Due: 18,400.00 USD\nCurrency: USD\n',
	);
	M(
		'malformed_07_garbled_ocr.txt',
		'garbled OCR, no field labels',
		'lNVOlCE  ####  vend0r:: Tra1lsp1n L0g1st1cs   acct 00ACH ***  7 7 2 1\namt  $  4 1 , 2 O O . O0   d ue  2O26O9O1   p o  # ?\nrnnnittance  unchan ged   thankyou f0r y0ur busi ness\n',
	);
	M(
		'malformed_08_smashed.txt',
		'all fields concatenated, no newlines',
		'invoicenumberTP-2026-3312vendornameTailspin Traders LLCremittoACH-****2201poPO-33120invoicedate2026-08-15duedate2026-09-14lineitemfreightforwardingtotalamountdue27,900.00USDcurrencyUSDremitperfileonbanking',
	);
	M(
		'malformed_09_absurd_amount.txt',
		'absurd / overflow amount',
		'ACME MANUFACTURING CO. — ACCOUNTS PAYABLE\nSUPPLIER INVOICE\n\nInvoice Number: XXL-2026-0001\nVendor Name: Consolidated Distribution Corp\nRemit-To Bank Account: ACH-****9001\nPurchase Order Number: PO-99999\nInvoice Date: 2026-08-20\nDue Date: 2026-09-19\n\nLine Item: Miscellaneous\nTotal Amount Due: 9,999,999,999.99 USD\nCurrency: USD\n',
	);
	M(
		'malformed_10_negative.txt',
		'negative total / credit note posted as invoice',
		'ACME MANUFACTURING CO. — ACCOUNTS PAYABLE\nSUPPLIER INVOICE\n\nInvoice Number: CN-2026-0455\nVendor Name: Wingtip Supplies Inc\nRemit-To Bank Account: ACH-****3355\nPurchase Order Number: PO-41200\nInvoice Date: 2026-08-16\nDue Date: 2026-09-15\n\nLine Item: Credit for returned goods (RMA-8891)\nTotal Amount Due: -12,750.00 USD\nCurrency: USD\n',
	);
	M(
		'malformed_11_conflicting_totals.txt',
		'three different totals, no reconciliation',
		'ACME MANUFACTURING CO. — ACCOUNTS PAYABLE\nSUPPLIER INVOICE\n\nInvoice Number: LIT-2026-6620\nVendor Name: Litware Consulting LLC\nRemit-To Bank Account: WIRE-****7788\nPurchase Order Number: PO-62210\nInvoice Date: 2026-08-14\nDue Date: 2026-09-13\n\nLine Item: Phase 1 delivery\nSubtotal: 22,000.00 USD\nSales Tax (8.0%): 1,760.00 USD\nTotal Amount Due: 31,240.00 USD\nBalance Payable: 18,900.00 USD\nCurrency: USD\n',
	);
	M(
		'malformed_12_json_blob.txt',
		'raw JSON blob instead of invoice text',
		'{"doc":"invoice","meta":{"id":null,"vendor":{"name":"","bank":""},"lines":[],"total":{"value":"NaN","ccy":"USD"}},"notes":"export failed — template fields not populated"}',
	);
	M(
		'malformed_13_truncated.txt',
		'file truncated mid-field',
		'HARBOR POINT LOGISTICS — ACCOUNTS PAYABLE\nSUPPLIER INVOICE\n\nInvoice Number: HPL-2026-88\nVendor Name: Harbor Poi',
	);

	return files;
}

// --- CLI --------------------------------------------------------------

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const files = generateInvoices();
	const byCat = files.reduce((m, f) => ((m[f.category] = (m[f.category] || 0) + 1), m), {});

	if (process.argv.includes('--emit')) {
		try {
			rmSync(OUT_DIR, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
		mkdirSync(OUT_DIR, { recursive: true });
		for (const f of files) writeFileSync(resolve(OUT_DIR, f.file), f.content);
		const manifest = files.map(({ content, ...meta }) => meta);
		writeFileSync(resolve(OUT_DIR, '_manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
		const written = readdirSync(OUT_DIR).length;
		console.log(`wrote ${files.length} invoices + _manifest.json to test-data/invoices/ (${written} entries)`);
	}

	console.log(`generated ${files.length} invoices`);
	for (const [k, n] of Object.entries(byCat)) console.log(`  ${k.padEnd(26)} ${n}`);
	console.log('\nsample (fraud_hold_01.txt):\n');
	console.log(files.find((f) => f.file === 'fraud_hold_01.txt').content);
}
