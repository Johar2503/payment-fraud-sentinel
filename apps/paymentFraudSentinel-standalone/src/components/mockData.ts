// =============================================================================
// MOCK DATA for visual development only.
//
// Nothing here calls the pipeline. The case shapes mirror the real
// `pending_review` objects the agent emits (captured from live test runs); the
// verification transcript below is a VERBATIM string captured from a real
// pipeline trace during testing — reused here as a static sample, not re-fetched.
// =============================================================================

import type { CaseRecord, ChatMessage, VerificationResult } from '../lib/types';

/** Real simulated-call transcript (webhook_verify text-only run). */
export const SAMPLE_VERIFICATION: VerificationResult = {
	invoice_number: 'TFS-2026-0091',
	verification: 'suspicious',
	questions: [
		'Can you confirm the remittance bank account on file for Tru-Fit Solutions Co? Our records show ACH-****2102, but invoice TFS-2026-0091 lists ACH-****8890. Did your banking details recently change?',
		'Invoice TFS-2026-0091 does not include a Purchase Order number. Can you provide the PO number or internal reference that authorized this $142,800 engagement?',
		"Can you confirm the invoice total, invoice date, and the nature of the line item described as 'Emergency bulk equipment procurement — expedited same-week delivery,' and explain why same-day wire payment is required?",
	],
	transcript: [
		{
			speaker: 'sentinel',
			text: 'Hello, this is Sentinel AP Verification calling for Tru-Fit Solutions Co. We are conducting a routine payment verification for invoice TFS-2026-0091 in the amount of $142,800.00 USD. Am I speaking with an authorized representative of Tru-Fit Solutions Co?',
		},
		{ speaker: 'vendor', text: 'Uh, yes, this is... Marcus Weil, accounts receivable. Go ahead.' },
		{
			speaker: 'sentinel',
			text: 'Thank you, Marcus. Question one: Our vendor master file shows the registered remittance account for Tru-Fit Solutions Co ending in 2102. Invoice TFS-2026-0091 requests payment to an account ending in 8890 and states that prior banking details are no longer valid. Can you confirm whether your banking details have officially changed, and if so, when and how that change was submitted to us?',
		},
		{
			speaker: 'vendor',
			text: 'Yes, correct — we recently switched banks. The new account is the right one, 8890. The change was... notified by email last week. You should have received something. Just go ahead and update it and process the wire today, it’s very time-sensitive.',
		},
		{
			speaker: 'sentinel',
			text: 'Understood. We have no record of a formal bank-change notification through our secure vendor portal or a signed bank-change authorization form. Our policy requires written authorization from a registered contact before updating remittance details. Can you tell me the name and email address of the person at your organization who submitted that change request, and the date it was sent?',
		},
		{
			speaker: 'vendor',
			text: "It was sent from... our finance director. I don't have the exact email in front of me right now. Can we sort this out after you process the payment? We really need this wire today.",
		},
		{
			speaker: 'sentinel',
			text: 'I understand there is urgency on your end. Moving to question two: Invoice TFS-2026-0091 does not include a Purchase Order number. For a transaction of this size, a PO is required. Can you provide the PO number or the name of the internal contact at our organization who authorized this purchase?',
		},
		{
			speaker: 'vendor',
			text: 'The PO... it was a verbal authorization, an emergency procurement situation. The contact was someone in your operations team — I believe a David or Daniel, I’m not sure of the last name. It was all done very quickly because of the urgent delivery window.',
		},
		{
			speaker: 'sentinel',
			text: "We are unable to process a $142,800 payment without a verifiable PO number or a named, confirmable internal authorizer. Question three: Can you describe in detail the goods or services covered under the line item 'Emergency bulk equipment procurement — expedited same-week delivery,' confirm the invoice total of $142,800.00, and explain the business need that necessitates same-day wire payment?",
		},
		{
			speaker: 'vendor',
			text: "It's bulk equipment — various industrial parts, I can send a list later. The total is $142,800, yes. The same-day wire is needed because our supplier won't hold the stock. Look, I really need you to just process this. Every minute counts here.",
		},
		{
			speaker: 'sentinel',
			text: 'Thank you for your time, Marcus. We are placing this invoice on hold pending a formal bank-change authorization, a confirmed PO number, a detailed itemized list of goods, and verification of the authorizing contact within our organization. We will follow up through our secure vendor portal. No payment will be issued until those items are resolved.',
		},
		{ speaker: 'vendor', text: "This is going to cost us a major contract. I'll have my director call you." },
	],
	notes:
		'OUTCOME: SUSPICIOUS — DO NOT PAY. All three verification areas produced red flags consistent with a Business Email Compromise (BEC) or fraudulent vendor invoice scheme. (1) BANK ACCOUNT: the vendor could not name who submitted the bank-change request, gave no date, and pressured to bypass change control — treat the change to ACH-****8890 as unverified and potentially fraudulent. (2) PO NUMBER: only a vague verbal-authorization claim, no confirmable PO, no full name for the authorizer. (3) LINE ITEM / URGENCY: no specific description of goods, documentation promised only after payment, repeated urgency pressure. RECOMMENDED: freeze payment for TFS-2026-0091; escalate to AP Fraud / InfoSec; attempt an independent callback using the phone number in the vendor master, not any number on this invoice; do not update bank details without a signed, verified authorization form.',
	completed_at: '2026-08-26T14:37:52Z',
};

const CHAT_TFS: ChatMessage[] = [
	{
		role: 'reviewer',
		text: 'Why did this go to auto-hold rather than just pending review?',
		at: '2026-08-26T14:20:03Z',
	},
	{
		role: 'assistant',
		text: 'All three deterministic hold rules fired for this invoice, and the rule is that any single one forces an auto-hold. (a) The remit-to account ACH-****8890 is not in the vendor master’s known accounts (only ACH-****2102). (b) The amount $142,800.00 is 4.19× the vendor mean of $34,057.53 — over the 2× threshold. (c) The vendor was first seen 2026-08-05, 21 days before the invoice date, inside the 30-day new-vendor window. With all three true, deterministic_hold = true.',
		at: '2026-08-26T14:20:14Z',
	},
	{
		role: 'reviewer',
		text: 'Do we have any prior email or phone contact history with this vendor’s AP department?',
		at: '2026-08-26T14:21:40Z',
	},
	{
		role: 'assistant',
		text: "I don't have any contact or communication history for this vendor in the case data provided. What I have is the vendor master record (ID V0008, known bank accounts, historical invoice amounts, risk score, first-seen date) and this invoice's extracted fields — there is no correspondence log, call history, or email thread in scope. You'd need to check the vendor management or CRM system directly for that.",
		at: '2026-08-26T14:21:52Z',
	},
];

/** Four sample cases spanning every tier / queue status. */
export const MOCK_CASES: CaseRecord[] = [
	{
		id: 'TFS-2026-0091::mock',
		receivedAt: '2026-08-26T14:18:20Z',
		sourceFile: 'invoice_fraud.txt',
		verificationResult: SAMPLE_VERIFICATION,
		chat: CHAT_TFS,
		case: {
			queue_status: 'auto_hold',
			invoice: {
				invoice_number: 'TFS-2026-0091',
				vendor_name: 'Tru-Fit Solutions Co',
				amount: '142800.00',
				currency: 'USD',
			},
			amount_analysis: {
				invoice_amount: 142800.0,
				vendor_mean_amount: 34057.53,
				ratio_vs_mean: 4.192905357493629,
				over_2x_mean: true,
			},
			vendor: {
				found: true,
				vendor_id: 'V0008',
				mean_amount: 34057.53,
				bank_account_known: false,
				amount_over_2x_mean: true,
				days_since_first_seen: 21,
			},
			deterministic_hold: true,
			rules_fired: ['bank_account_not_known', 'amount_over_2x_mean', 'vendor_first_seen_within_30_days'],
			risk: {
				risk_score: 92,
				risk_level: 'critical',
				flags: [
					{
						type: 'unknown_payee_bank_account',
						evidence:
							"Remit-to account ACH-****8890 is not in the vendor-master known_bank_accounts list ['ACH-****2102'].",
					},
					{
						type: 'bank_change_language',
						evidence:
							"Invoice states 'Prior banking details on file are no longer valid — please update the remittance account immediately,' a classic social-engineering indicator.",
					},
					{
						type: 'urgency_same_day_wire',
						evidence:
							"Invoice explicitly states 'URGENT: Vendor requests same-day wire' with a due date only 2 days after the invoice date (2026-08-26 to 2026-08-28).",
					},
					{
						type: 'amount_outlier',
						evidence:
							"Invoice amount $142,800.00 is 4.19x the vendor's historical mean of $34,057.53, far exceeding the 2x threshold.",
					},
					{
						type: 'missing_po',
						evidence: 'Purchase Order Number field is blank; no PO reference provided on a $142,800 invoice.',
					},
					{
						type: 'new_vendor',
						evidence:
							'Vendor first seen 2026-08-05, only 21 days before this invoice date; vendor tenure is under 30 days.',
					},
					{
						type: 'round_sum_amount',
						evidence:
							'Invoice total of $142,800.00 is a suspiciously round figure with no cents, consistent with fabricated invoices.',
					},
					{
						type: 'unrecognised_line_item_category',
						evidence:
							"Line item 'Emergency bulk equipment procurement — expedited same-week delivery' did not match any recognised classification in the vendor schema.",
					},
				],
			},
			verification: { status: 'pending', result: null },
			summary:
				'AUTO HOLD: All three deterministic hold rules fired for invoice TFS-2026-0091 from Tru-Fit Solutions Co (vendor V0008). The remit-to bank account ACH-****8890 is unknown (known: ACH-****2102); the amount $142,800.00 is 4.19x the vendor historical mean of $34,057.53 (threshold 2x); and the vendor was first seen only 21 days ago (threshold 30 days). Additional critical indicators: same-day wire urgency language, a demand to update banking details mid-transaction, no purchase order, a round-sum amount, and a 2-day payment window. Risk score 92/100 (critical). Out-of-band vendor verification is required before any payment action.',
		},
	},
	{
		id: 'NWF-2026-1188::mock',
		receivedAt: '2026-08-27T09:02:10Z',
		sourceFile: 'northwind_freight_1188.txt',
		case: {
			queue_status: 'pending_review',
			invoice: {
				invoice_number: 'NWF-2026-1188',
				vendor_name: 'Northwind Freight LLC',
				amount: '61240.00',
				currency: 'USD',
			},
			amount_analysis: {
				invoice_amount: 61240.0,
				vendor_mean_amount: 26580.4,
				ratio_vs_mean: 2.304,
				over_2x_mean: true,
			},
			vendor: {
				found: true,
				vendor_id: 'V0021',
				mean_amount: 26580.4,
				bank_account_known: true,
				amount_over_2x_mean: true,
				days_since_first_seen: 214,
			},
			deterministic_hold: false,
			rules_fired: ['amount_over_2x_mean'],
			risk: {
				risk_score: 58,
				risk_level: 'medium',
				flags: [
					{
						type: 'amount_outlier',
						evidence:
							"Invoice amount $61,240.00 is 2.30x the vendor's historical mean of $26,580.40, above the 2x review threshold.",
					},
					{
						type: 'urgency_language',
						evidence:
							"Invoice memo reads 'Please expedite — carrier will not release the shipment until this clears.' Soft urgency, no wire demand.",
					},
					{
						type: 'weekend_submission',
						evidence: 'Invoice received Saturday 2026-08-27 09:02 outside normal vendor billing hours.',
					},
				],
			},
			verification: { status: 'not_required', result: null },
			summary:
				'PENDING REVIEW: Invoice NWF-2026-1188 from Northwind Freight LLC (V0021) for $61,240.00 clears all deterministic hold rules — the remit-to account is on file and the vendor has 214 days of tenure — but the amount is 2.30x the vendor mean of $26,580.40 and the memo carries mild urgency language, so it is routed to a human reviewer. Risk score 58/100 (medium).',
		},
	},
	{
		id: 'CPS-2026-0473::mock',
		receivedAt: '2026-08-27T11:47:55Z',
		sourceFile: 'cobalt_print_0473.txt',
		case: {
			queue_status: 'pending_review',
			invoice: {
				invoice_number: 'CPS-2026-0473',
				vendor_name: 'Cobalt Print & Signage',
				amount: '18930.00',
				currency: 'USD',
			},
			amount_analysis: {
				invoice_amount: 18930.0,
				vendor_mean_amount: 15110.75,
				ratio_vs_mean: 1.253,
				over_2x_mean: false,
			},
			vendor: {
				found: true,
				vendor_id: 'V0044',
				mean_amount: 15110.75,
				bank_account_known: false,
				amount_over_2x_mean: false,
				days_since_first_seen: 402,
			},
			deterministic_hold: false,
			rules_fired: ['bank_account_not_known'],
			risk: {
				risk_score: 71,
				risk_level: 'high',
				flags: [
					{
						type: 'unknown_payee_bank_account',
						evidence:
							"Remit-to account ACH-****5567 is not in the vendor-master known_bank_accounts list ['ACH-****9910'].",
					},
					{
						type: 'no_bank_change_notice',
						evidence:
							'No accompanying bank-change authorization or note explaining the different remittance account.',
					},
				],
			},
			verification: { status: 'not_required', result: null },
			summary:
				'PENDING REVIEW: Invoice CPS-2026-0473 from Cobalt Print & Signage (V0044) for $18,930.00 is within normal amount range (1.25x mean) and the vendor is well established (402 days), so no auto-hold. However the remit-to account ACH-****5567 does not match the known account ACH-****9910 and no bank-change notice was provided. Routed for human verification of the account. Risk score 71/100 (high).',
		},
	},
	{
		id: 'BY-2026-04417::mock',
		receivedAt: '2026-08-27T13:05:41Z',
		sourceFile: 'invoice_clean.txt',
		case: {
			queue_status: 'auto_cleared',
			invoice: {
				invoice_number: 'BY-2026-04417',
				vendor_name: 'Blue Yonder Systems Inc',
				amount: '26460.00',
				currency: 'USD',
			},
			amount_analysis: {
				invoice_amount: 26460.0,
				vendor_mean_amount: 27518.83,
				ratio_vs_mean: 0.9615,
				over_2x_mean: false,
			},
			vendor: {
				found: true,
				vendor_id: 'V0003',
				mean_amount: 27518.83,
				bank_account_known: true,
				amount_over_2x_mean: false,
				days_since_first_seen: 1262,
			},
			deterministic_hold: false,
			rules_fired: [],
			risk: {
				risk_score: 10,
				risk_level: 'low',
				flags: [
					{
						type: 'unknown_line_item_category',
						evidence:
							"Anomaly detector flagged line_item_description 'Quarterly managed analytics platform subscription and standard support' as not a recognised classification (warning only; no financial impact).",
					},
				],
			},
			verification: { status: 'not_required', result: null },
			summary:
				'Invoice BY-2026-04417 from Blue Yonder Systems Inc (V0003) for USD 26,460.00 passes all deterministic hold checks: the remit-to account ACH-****7172 is on file, the amount is within 2x the vendor mean of USD 27,518.83, and the vendor has 1,262 days of tenure. Tax arithmetic is correct (8% of 24,500 = 1,960). No urgency or bank-change language, PO-88231 present, no round-sum anomaly. Risk level low; invoice auto-cleared for payment.',
		},
	},
];
