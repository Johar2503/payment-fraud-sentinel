// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/** The approval-queue store. In the shell app this is workspace appState; here
 * it is localStorage. Same `CaseStore` surface the views expect, so the ported
 * pipeline/UI logic is unchanged. */

import { useCallback, useSyncExternalStore } from 'react';
import type { CaseRecord, ChatMessage, Decision, VerificationResult } from './types';

const KEY = 'pfs-standalone:cases';

let cache: CaseRecord[] = load();
const listeners = new Set<() => void>();

function load(): CaseRecord[] {
	try {
		const raw = localStorage.getItem(KEY);
		const parsed = raw ? JSON.parse(raw) : null;
		return Array.isArray(parsed) ? (parsed as CaseRecord[]) : [];
	} catch {
		return [];
	}
}

function commit(next: CaseRecord[]): void {
	cache = next;
	try {
		localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		/* quota / private mode — keep the in-memory copy */
	}
	for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
	listeners.add(l);
	return () => listeners.delete(l);
}
const getSnapshot = () => cache;

function mutate(fn: (prev: CaseRecord[]) => CaseRecord[]): void {
	commit(fn(cache));
}

export interface CaseStore {
	loaded: boolean;
	cases: CaseRecord[];
	addCases: (recs: CaseRecord[]) => void;
	removeCase: (id: string) => void;
	attachVerification: (id: string, result: VerificationResult) => void;
	appendChat: (id: string, turns: ChatMessage[]) => void;
	recordDecision: (id: string, decision: Decision, reviewer: string, note: string, acked: boolean) => void;
}

export function useCaseStore(): CaseStore {
	const cases = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

	return {
		loaded: true,
		cases,
		addCases: useCallback((recs) => mutate((prev) => [...recs, ...prev]), []),
		removeCase: useCallback((id) => mutate((prev) => prev.filter((r) => r.id !== id)), []),
		attachVerification: useCallback(
			(id, result) => mutate((prev) => prev.map((r) => (r.id === id ? { ...r, verificationResult: result } : r))),
			[],
		),
		appendChat: useCallback(
			(id, turns) =>
				mutate((prev) => prev.map((r) => (r.id === id ? { ...r, chat: [...(r.chat ?? []), ...turns] } : r))),
			[],
		),
		recordDecision: useCallback(
			(id, decision, reviewer, note, acked) =>
				mutate((prev) =>
					prev.map((r) =>
						r.id === id
							? { ...r, decision: { decision, reviewer, note, decidedAt: new Date().toISOString(), acked } }
							: r,
					),
				),
			[],
		),
	};
}

// --- small derived helpers used by the views ------------------------------

export function queueBucket(rec: CaseRecord): 'cleared' | 'review' | 'hold' | 'decided' {
	if (rec.decision) return 'decided';
	if (rec.case.queue_status === 'auto_cleared') return 'cleared';
	if (rec.case.queue_status === 'auto_hold') return 'hold';
	return 'review';
}
