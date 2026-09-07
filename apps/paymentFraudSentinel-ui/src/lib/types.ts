// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/** Domain types for Payment Fraud Sentinel.
 *
 * `PendingCase` mirrors the JSON object the `agent_rocketride_1` node emits on
 * the `pending_review` result of pipelines/payment_fraud_sentinel_v2.pipe.
 * The agent also emits an intermediate answer, so the pipeline result is an
 * array — see parsePendingReview() in ./pipeline.ts. */

export type QueueStatus = 'auto_cleared' | 'pending_review' | 'auto_hold';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type VerificationStatus = 'not_required' | 'pending' | 'confirmed' | 'suspicious';
export type Decision = 'approve' | 'reject';

export interface RiskFlag {
	type: string;
	evidence: string;
}

export interface PendingCase {
	queue_status: QueueStatus;
	invoice: {
		invoice_number: string;
		vendor_name: string;
		amount: string;
		currency: string;
	};
	/** The extracted + validated facts document, verbatim from schema_validate. */
	facts?: Record<string, unknown>;
	amount_analysis?: {
		invoice_amount: number;
		vendor_mean_amount: number | null;
		ratio_vs_mean: number | null;
		over_2x_mean: boolean;
	};
	vendor: {
		found: boolean;
		vendor_id: string | null;
		mean_amount: number | null;
		bank_account_known: boolean;
		amount_over_2x_mean: boolean;
		days_since_first_seen: number | null;
	};
	deterministic_hold: boolean;
	rules_fired: string[];
	risk: {
		risk_score: number;
		risk_level: RiskLevel;
		flags: RiskFlag[];
	};
	verification: {
		status: 'not_required' | 'pending';
		result: unknown | null;
	};
	summary: string;
}

/** One turn of the case-specific reviewer Q&A (webhook_chat flow). */
export interface ChatMessage {
	role: 'reviewer' | 'assistant';
	text: string;
	at: string;
}

/** Result of the async webhook_verify flow (llm_verify node). */
export interface VerificationResult {
	invoice_number?: string;
	verification: 'confirmed' | 'suspicious';
	questions: string[];
	transcript: { speaker: 'sentinel' | 'vendor'; text: string }[];
	notes: string;
	completed_at?: string;
}

/** One row in the local approval queue — the parsed case plus local overlays
 * the pipeline never sees (persisted in workspace appState). */
export interface CaseRecord {
	/** Stable local id (invoice_number + receivedAt). */
	id: string;
	receivedAt: string;
	sourceFile: string;
	case: PendingCase;
	/** Attached after the async verification flow completes. */
	verificationResult?: VerificationResult;
	/** Case-specific reviewer Q&A history (persisted with the case). */
	chat?: ChatMessage[];
	/** Set once a human approves/rejects from the queue. */
	decision?: {
		decision: Decision;
		reviewer: string;
		note: string;
		decidedAt: string;
		acked: boolean;
	};
}

export interface PersistedState {
	cases: CaseRecord[];
}
