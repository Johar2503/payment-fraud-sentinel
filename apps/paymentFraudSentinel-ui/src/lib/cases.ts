// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/** The approval-queue store: CaseRecord[] persisted in workspace appState
 * (per user, survives reload). Debounced saves start only after `loaded`. */

import { useCallback, useMemo } from 'react';
import { useWorkspace } from 'shell';
import type { CaseRecord, ChatMessage, Decision, VerificationResult } from './types';

interface Shape {
	cases: CaseRecord[];
}

function readCases(appState: unknown): CaseRecord[] {
	const c = (appState as Shape | undefined)?.cases;
	return Array.isArray(c) ? c : [];
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
	const { appState, updateAppState, loaded } = useWorkspace();
	const cases = useMemo(() => readCases(appState), [appState]);

	const mutate = useCallback(
		(fn: (prev: CaseRecord[]) => CaseRecord[]) => {
			updateAppState((prev: unknown) => ({
				...(prev as object),
				cases: fn(readCases(prev)),
			}));
		},
		[updateAppState],
	);

	return {
		loaded,
		cases,
		addCases: useCallback(
			(recs) => mutate((prev) => [...recs, ...prev]),
			[mutate],
		),
		removeCase: useCallback((id) => mutate((prev) => prev.filter((r) => r.id !== id)), [mutate]),
		attachVerification: useCallback(
			(id, result) =>
				mutate((prev) => prev.map((r) => (r.id === id ? { ...r, verificationResult: result } : r))),
			[mutate],
		),
		appendChat: useCallback(
			(id, turns) =>
				mutate((prev) =>
					prev.map((r) => (r.id === id ? { ...r, chat: [...(r.chat ?? []), ...turns] } : r)),
				),
			[mutate],
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
			[mutate],
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
