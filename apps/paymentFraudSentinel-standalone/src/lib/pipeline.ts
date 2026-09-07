// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/** The one place the app talks to payment_fraud_sentinel_v2.pipe.
 *
 * PORTED VERBATIM from apps/paymentFraudSentinel-ui/src/lib/pipeline.ts — the
 * parsing helpers, per-file isolated tasks, dead-token retry, parseVerification
 * fallback, and chat payload trimming are the already-tested logic. The only
 * changes: the client comes from our own RrConnectionProvider instead of the
 * shell, and it is typed as RocketRideClient directly.
 *
 * The pipeline has four webhook sources:
 *   webhook_invoice   sendFiles  -> pending_review        (the case JSON)
 *   webhook_verify    send(text) -> verification_result   (async vendor call)
 *   webhook_feedback  send(text) -> feedback_ack          (risk_history writeback)
 *   webhook_chat      send(text) -> chat_answer           (per-case reviewer Q&A)
 *
 * verify + feedback use one long-lived per-user task each. Invoice submission
 * does NOT: a reused webhook task merges results across objects (the
 * contamination bug), so `submitInvoices` spins up a fresh, isolated task per
 * file, sends that one file, parses, and terminates it before the next.
 */

import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { RocketRideClient } from 'rocketride';
import V2_PIPE from '../../../../pipelines/payment_fraud_sentinel_v2.pipe';
import { useRrConnection } from './rrClient';
import type { CaseRecord, ChatMessage, Decision, PendingCase, VerificationResult } from './types';

const PROJECT_ID = String((V2_PIPE as { project_id?: string }).project_id ?? '');
const TTL = 1800; // 30 min idle window per task

type SourceId = 'webhook_invoice' | 'webhook_verify' | 'webhook_feedback' | 'webhook_chat';

// ---------------------------------------------------------------------------
// Result parsing — agent_rocketride_1 emits an intermediate answer plus the
// final JSON, so `pending_review` comes back as an array. Take the last
// element that parses to a JSON object with the expected shape.
// ---------------------------------------------------------------------------

function coerceJsonObject(item: unknown): Record<string, unknown> | null {
	if (item && typeof item === 'object') return item as Record<string, unknown>;
	if (typeof item !== 'string') return null;
	const cleaned = item.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
	try {
		const obj = JSON.parse(cleaned);
		return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/** Robust reader for a pipeline result key that may be a single value or an
 * array of answers. `predicate` picks the wanted object when several parse. */
export function parseJsonAnswer<T>(
	result: Record<string, unknown> | undefined,
	key: string,
	predicate: (o: Record<string, unknown>) => boolean,
): T | null {
	const raw = result?.[key];
	const arr = Array.isArray(raw) ? raw : [raw];
	for (const item of [...arr].reverse()) {
		const obj = coerceJsonObject(item);
		if (obj && predicate(obj)) return obj as T;
	}
	return null;
}

export function parsePendingReview(result: Record<string, unknown> | undefined): PendingCase | null {
	const predicate = (o: Record<string, unknown>) => 'queue_status' in o && 'vendor' in o;
	const fast = parseJsonAnswer<PendingCase>(result, 'pending_review', predicate);
	if (fast) return fast;
	// Fallback: on the Gemini build the agent sometimes wraps the final case
	// object in prose ("Here is the assessed case: {…}"). Dig the JSON object
	// out of each answer string — same treatment parseVerification already gets.
	const raw = result?.pending_review;
	const arr = Array.isArray(raw) ? raw : [raw];
	for (const item of [...arr].reverse()) {
		if (typeof item !== 'string') continue;
		const dug = extractEmbeddedJson(item, predicate);
		if (dug) return dug as unknown as PendingCase;
	}
	return null;
}

/** Scan a string for balanced `{...}` blocks and return the first one that
 * parses to an object satisfying `predicate`. Brace-depth aware and
 * string-literal aware, so it survives JSON embedded in prose, markdown, or a
 * verbose "FRAUD ALERT" writeup that llm_verify sometimes emits alongside (or
 * instead of) a clean object. */
function extractEmbeddedJson(
	text: string,
	predicate: (o: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
	for (let i = 0; i < text.length; i++) {
		if (text[i] !== '{') continue;
		let depth = 0;
		let inStr = false;
		let esc = false;
		for (let j = i; j < text.length; j++) {
			const ch = text[j];
			if (inStr) {
				if (esc) esc = false;
				else if (ch === '\\') esc = true;
				else if (ch === '"') inStr = false;
				continue;
			}
			if (ch === '"') inStr = true;
			else if (ch === '{') depth++;
			else if (ch === '}') {
				depth--;
				if (depth === 0) {
					try {
						const obj = JSON.parse(text.slice(i, j + 1));
						if (obj && typeof obj === 'object' && predicate(obj as Record<string, unknown>)) {
							return obj as Record<string, unknown>;
						}
					} catch {
						/* not valid JSON from here — fall through to next '{' */
					}
					break;
				}
			}
		}
	}
	return null;
}

export function parseVerification(result: Record<string, unknown> | undefined): VerificationResult | null {
	const predicate = (o: Record<string, unknown>) => 'verification' in o && 'transcript' in o;
	const fast = parseJsonAnswer<VerificationResult>(result, 'verification_result', predicate);
	if (fast) return fast;
	// Fallback: llm_verify sometimes wraps the object in prose / a markdown
	// report. Dig the JSON out of each answer string.
	const raw = result?.verification_result;
	const arr = Array.isArray(raw) ? raw : [raw];
	for (const item of [...arr].reverse()) {
		if (typeof item !== 'string') continue;
		const dug = extractEmbeddedJson(item, predicate);
		if (dug) return dug as unknown as VerificationResult;
	}
	return null;
}

/** Drop `_provenance` / `_validation` from a facts document — extraction-pass
 * metadata (page/table refs, confidence, validator notes), not invoice data.
 * Recursive in case a pipeline emits an array of fact records. */
export function stripFactsMeta(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(stripFactsMeta);
	if (node && typeof node === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
			if (k === '_provenance' || k === '_validation') continue;
			out[k] = stripFactsMeta(v);
		}
		return out;
	}
	return node;
}

/** chat_answer is plain LLM prose (possibly wrapped in an answers array). */
export function parseChatAnswer(result: Record<string, unknown> | undefined): string {
	const raw = result?.chat_answer;
	const arr = Array.isArray(raw) ? raw : [raw];
	for (const item of [...arr].reverse()) {
		if (typeof item === 'string' && item.trim()) return item.trim();
		if (item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string') {
			return String((item as { text: string }).text).trim();
		}
	}
	return '';
}

// ---------------------------------------------------------------------------
// usePipeline — starts (or re-attaches to) the warmed tasks and exposes the
// operations the UI needs.
// ---------------------------------------------------------------------------

/** Per-file callback so the Submit view can show live progress and drop each
 * finished case into the queue as it lands, rather than all-at-once at the end. */
export interface SubmitProgress {
	index: number;
	total: number;
	name: string;
	phase: 'start' | 'done' | 'failed';
	detail?: string;
	record?: CaseRecord;
}

export interface PipelineApi {
	ready: boolean;
	error: string | null;
	retry: () => void;
	submitInvoices: (
		files: File[],
		onProgress?: (p: SubmitProgress) => void,
	) => Promise<{ ok: CaseRecord[]; failed: { name: string; reason: string }[] }>;
	runVerification: (rec: CaseRecord) => Promise<VerificationResult>;
	/** Case-specific Q&A. Fresh isolated task per question (no shared reuse). */
	askAboutCase: (rec: CaseRecord, question: string, history: ChatMessage[]) => Promise<string>;
	sendDecision: (rec: CaseRecord, decision: Decision, reviewer: string, note: string) => Promise<void>;
}

async function acquireToken(client: RocketRideClient, source: SourceId, forceNew = false): Promise<string> {
	// forceNew skips the getTaskToken short-circuit — used on the retry path,
	// where getTaskToken may still hand back the token of a task that was
	// terminated out from under us.
	if (!forceNew && PROJECT_ID) {
		const existing = await client.getTaskToken({ projectId: PROJECT_ID, source }).catch(() => undefined);
		if (existing) return existing;
	}
	const res = await client.use({
		pipeline: V2_PIPE as never,
		source,
		useExisting: true,
		ttl: TTL,
		name: `Fraud Sentinel — ${source}`,
	});
	return res.token as string;
}

/** A warmed long-lived task can die between uses — idle TTL expiry, a server
 * restart, or another client terminating it. send() against it then fails with
 * "pipeline is not running / task terminated". Detect that one failure mode,
 * re-acquire a fresh task for the source, and retry the send once. */
function isDeadTaskError(e: unknown): boolean {
	const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
	return (
		m.includes('not running') ||
		m.includes('terminated') ||
		m.includes('wrong token') ||
		m.includes('no such task') ||
		m.includes('unknown task')
	);
}

async function sendOnWarmedTask(
	client: RocketRideClient,
	tokens: MutableRefObject<Partial<Record<SourceId, string>>>,
	source: 'webhook_verify' | 'webhook_feedback',
	body: string,
): Promise<Record<string, unknown>> {
	let token = tokens.current[source];
	if (!token) {
		token = await acquireToken(client, source);
		tokens.current[source] = token;
	}
	try {
		return (await client.send(token, body, undefined, 'text/plain')) as Record<string, unknown>;
	} catch (e) {
		if (!isDeadTaskError(e)) throw e;
		const fresh = await acquireToken(client, source, true);
		tokens.current[source] = fresh;
		return (await client.send(fresh, body, undefined, 'text/plain')) as Record<string, unknown>;
	}
}

export function usePipeline(): PipelineApi {
	const { client, isConnected } = useRrConnection();
	const tokens = useRef<Partial<Record<SourceId, string>>>({});
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [attempt, setAttempt] = useState(0);

	useEffect(() => {
		if (!client || !isConnected) return;
		let cancelled = false;
		setError(null);
		(async () => {
			try {
				// verify + feedback run on one long-lived task each. Invoice
				// submission manages its own isolated task per file (see
				// submitInvoices), so it is not warmed here.
				const [ver, fb] = await Promise.all([
					acquireToken(client, 'webhook_verify'),
					acquireToken(client, 'webhook_feedback'),
				]);
				if (cancelled) return;
				tokens.current = { webhook_verify: ver, webhook_feedback: fb };
				setReady(true);
			} catch (e) {
				if (!cancelled) setError(e instanceof Error ? e.message : String(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [client, isConnected, attempt]);

	const submitInvoices = useCallback<PipelineApi['submitInvoices']>(
		async (files, onProgress) => {
			if (!client) throw new Error('Not connected');

			// Drop any leftover shared invoice task first, so each file below runs
			// on a clean isolated instance.
			if (PROJECT_ID) {
				const stale = await client
					.getTaskToken({ projectId: PROJECT_ID, source: 'webhook_invoice' })
					.catch(() => undefined);
				if (stale) await client.terminate(stale).catch(() => {});
			}

			const ok: CaseRecord[] = [];
			const failed: { name: string; reason: string }[] = [];

			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const name = file.name || `file-${i}`;
				onProgress?.({ index: i, total: files.length, name, phase: 'start' });

				let token: string | undefined;
				try {
					// Fresh, isolated task for this one file.
					const started = await client.use({
						pipeline: V2_PIPE as never,
						source: 'webhook_invoice',
						ttl: 600, // auto-expires if terminate below is somehow missed
						name: `Fraud Sentinel — ${name}`,
					});
					token = started.token as string;

					const [r] = await client.sendFiles(
						[{ file, mimetype: file.type || 'application/octet-stream' }],
						token,
					);

					if (r?.error) {
						failed.push({ name, reason: String(r.error) });
						onProgress?.({ index: i, total: files.length, name, phase: 'failed', detail: String(r.error) });
					} else {
						const parsed = parsePendingReview(r?.result as Record<string, unknown>);
						if (!parsed) {
							failed.push({ name, reason: 'Pipeline returned no parseable case' });
							onProgress?.({ index: i, total: files.length, name, phase: 'failed', detail: 'no parseable case' });
						} else {
							const receivedAt = new Date().toISOString();
							const rec: CaseRecord = {
								id: `${parsed.invoice.invoice_number || name}::${receivedAt}`,
								receivedAt,
								sourceFile: name,
								case: parsed,
							};
							ok.push(rec);
							onProgress?.({
								index: i,
								total: files.length,
								name,
								phase: 'done',
								detail: `${parsed.queue_status.replace(/_/g, ' ')} · risk ${parsed.risk.risk_level}`,
								record: rec,
							});
						}
					}
				} catch (e) {
					const reason = e instanceof Error ? e.message : String(e);
					failed.push({ name, reason });
					onProgress?.({ index: i, total: files.length, name, phase: 'failed', detail: reason });
				} finally {
					// Fire-and-forget: this file's result is already recorded, so don't
					// block the next file on the terminate ACK (~5s). The task still
					// ends — async terminate, or its 600s TTL as backup.
					if (token) void client.terminate(token).catch(() => {});
				}
			}
			return { ok, failed };
		},
		[client],
	);

	const runVerification = useCallback<PipelineApi['runVerification']>(
		async (rec) => {
			if (!client) throw new Error('Not connected');
			const payload = {
				invoice_number: rec.case.invoice.invoice_number,
				vendor_name: rec.case.invoice.vendor_name,
				amount: rec.case.invoice.amount,
				currency: rec.case.invoice.currency,
				risk_level: rec.case.risk.risk_level,
				flags: rec.case.risk.flags,
				rules_fired: rec.case.rules_fired,
				facts: rec.case.facts ?? null,
			};
			// Re-acquires the verify task and retries once if it died since mount
			// (idle TTL, server restart, external terminate).
			const result = await sendOnWarmedTask(client, tokens, 'webhook_verify', JSON.stringify(payload));
			const parsed = parseVerification(result as Record<string, unknown>);
			if (!parsed) throw new Error('Verification pipeline returned no parseable result');
			return parsed;
		},
		[client],
	);

	const askAboutCase = useCallback<PipelineApi['askAboutCase']>(
		async (rec, question, history) => {
			if (!client) throw new Error('Not connected');

			// Fresh isolated task per question — a reused chat task would merge
			// answers across cases (the contamination bug), same as submitInvoices.
			if (PROJECT_ID) {
				const stale = await client
					.getTaskToken({ projectId: PROJECT_ID, source: 'webhook_chat' })
					.catch(() => undefined);
				if (stale) await client.terminate(stale).catch(() => {});
			}

			let token: string | undefined;
			try {
				const started = await client.use({
					pipeline: V2_PIPE as never,
					source: 'webhook_chat',
					ttl: 600,
					name: `Fraud Sentinel — chat ${rec.case.invoice.invoice_number || rec.id}`,
				});
				token = started.token as string;

				const payload = {
					case: {
						...rec.case,
						// Extraction metadata only — safe to drop, cannot affect answers.
						facts: rec.case.facts
							? (stripFactsMeta(rec.case.facts) as Record<string, unknown>)
							: rec.case.facts,
						verification: rec.verificationResult
							? { status: 'completed', result: rec.verificationResult }
							: rec.case.verification,
					},
					question,
					// Full history — never capped, so no conversational context is lost.
					history: history.map((m) => ({ role: m.role, text: m.text })),
				};
				const result = await client.send(token, JSON.stringify(payload), undefined, 'text/plain');
				const answer = parseChatAnswer(result as Record<string, unknown>);
				if (!answer) throw new Error('Assistant returned no answer');
				return answer;
			} finally {
				// Fire-and-forget: the answer is already in hand, so don't block the
				// return on the terminate ACK (~5s). The task still ends — the async
				// terminate, or its 600s TTL as backup.
				if (token) void client.terminate(token).catch(() => {});
			}
		},
		[client],
	);

	const sendDecision = useCallback<PipelineApi['sendDecision']>(
		async (rec, decision, reviewer, note) => {
			if (!client) throw new Error('Not connected');
			const payload = {
				vendor_id: rec.case.vendor.vendor_id,
				vendor_name: rec.case.invoice.vendor_name,
				invoice_number: rec.case.invoice.invoice_number,
				decision,
				event: 'human_review',
				reviewer,
				note,
				decided_at: new Date().toISOString(),
			};
			await sendOnWarmedTask(client, tokens, 'webhook_feedback', JSON.stringify(payload));
		},
		[client],
	);

	return {
		ready,
		error,
		retry: () => {
			setReady(false);
			setAttempt((n) => n + 1);
		},
		submitInvoices,
		runVerification,
		askAboutCase,
		sendDecision,
	};
}
