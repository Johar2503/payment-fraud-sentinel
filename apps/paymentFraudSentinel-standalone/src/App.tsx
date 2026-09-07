// =============================================================================
// App — live wiring hub.
//
// Composes the styled components against real pipeline calls (src/lib/pipeline
// + src/lib/store). Cost discipline:
//   - submit + verification are two-step: a click ARMS, a second confirming
//     click FIRES. Nothing fires on mount / re-render / hot-reload.
//   - chat fires immediately (cheap, ungated).
//   - a dismissible session spend estimate in the header increments when a
//     submit or verification call actually fires (rough client-side guess).
// Sample cases (shown only while the store is empty) keep verification +
// decisions disabled; chat stays available.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePipeline } from './lib/pipeline';
import { useRrConnection } from './lib/rrClient';
import { useCaseStore } from './lib/store';
import type { CaseRecord, Decision } from './lib/types';
import { COST } from './components/costEstimates';
import { friendlyError } from './lib/friendlyError';
import { MOCK_CASES } from './components/mockData';
import { SubmitPanel } from './components/SubmitPanel';
import { Dot, Inbox, Search, X } from './components/icons';
import { CaseDetailPanel } from './views/CaseDetailPanel';
import { QueueDashboard } from './views/QueueDashboard';

const ARM_WINDOW_MS = 6000;
const SAMPLE_ACTION_NOTE = 'Sample case — submit a real invoice to run verification and record a decision.';
const REVIEWER_KEY = 'pfs-standalone:reviewer';
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const readReviewer = (): string => {
	try {
		return localStorage.getItem(REVIEWER_KEY) || 'AP Analyst';
	} catch {
		return 'AP Analyst';
	}
};

const App: React.FC = () => {
	const { isConnected } = useRrConnection();
	const store = useCaseStore();
	const api = usePipeline();

	// Public demo: every visitor starts from the real queue, which begins empty
	// (main.tsx clears any prior localStorage on a fresh open). The bundled
	// MOCK_CASES preview is disabled so samples never look like prior activity.
	const usingSamples = false;
	const cases = usingSamples ? MOCK_CASES : store.cases;

	const [selectedId, setSelectedId] = useState<string | null>(cases[0]?.id ?? null);
	const selected = useMemo(() => cases.find((c) => c.id === selectedId) ?? null, [cases, selectedId]);

	// Keep the selection valid as the case source flips (selection state only —
	// this never triggers a pipeline call).
	useEffect(() => {
		if (selectedId && !cases.some((c) => c.id === selectedId)) setSelectedId(cases[0]?.id ?? null);
	}, [cases, selectedId]);

	// Undecided cases still on hold or awaiting review — the header's anchor stat.
	const needsAction = useMemo(
		() =>
			cases.filter(
				(r) => !r.decision && (r.case.queue_status === 'auto_hold' || r.case.queue_status === 'pending_review'),
			).length,
		[cases],
	);

	// Reviewer identity for decision writebacks — editable, persisted per browser.
	const [reviewer, setReviewer] = useState(readReviewer);
	useEffect(() => {
		try {
			localStorage.setItem(REVIEWER_KEY, reviewer.trim() || 'AP Analyst');
		} catch {
			/* private mode / quota — keep the in-memory value */
		}
	}, [reviewer]);

	// On phones/tablets the detail panel renders far below the queue; bring it
	// into view when the analyst picks a case (but not on the initial mount pick).
	const detailRef = useRef<HTMLDivElement>(null);
	const firstSelect = useRef(true);
	useEffect(() => {
		if (firstSelect.current) {
			firstSelect.current = false;
			return;
		}
		if (!selectedId || typeof window === 'undefined') return;
		if (!window.matchMedia('(max-width: 1023px)').matches) return;
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		detailRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
	}, [selectedId]);

	// ---- session spend estimate (rough, client-side, not billing) ----
	const [estSpent, setEstSpent] = useState(0);
	const [costHidden, setCostHidden] = useState(false);
	const addSpend = useCallback((amount: number) => {
		setEstSpent((s) => Math.round((s + amount) * 100) / 100);
	}, []);

	const [actionError, setActionError] = useState<string | null>(null);
	const [errDetails, setErrDetails] = useState(false);

	// ---- verification: two-click cost confirm ----
	const [verifyArm, setVerifyArm] = useState<{ id: string; at: number } | null>(null);
	const [verifyBusyId, setVerifyBusyId] = useState<string | null>(null);
	const [chatBusyId, setChatBusyId] = useState<string | null>(null);
	const [decisionBusyId, setDecisionBusyId] = useState<string | null>(null);

	// auto-disarm the verification confirm after a few seconds
	useEffect(() => {
		if (!verifyArm) return;
		const t = window.setTimeout(
			() => setVerifyArm((cur) => (cur && cur.id === verifyArm.id ? null : cur)),
			ARM_WINDOW_MS,
		);
		return () => window.clearTimeout(t);
	}, [verifyArm]);

	// --- 2. RUN VERIFICATION (high-cost, confirmed) ------------------------------
	const doVerify = useCallback(
		async (rec: CaseRecord) => {
			setVerifyArm(null);
			setVerifyBusyId(rec.id);
			setActionError(null);
			addSpend(COST.verificationEst); // estimate bumps as the real call fires
			try {
				const result = await api.runVerification(rec);
				store.attachVerification(rec.id, result);
			} catch (e) {
				setActionError(
					`Verification failed for ${rec.case.invoice.invoice_number || rec.sourceFile}: ${msg(e)}`,
				);
			} finally {
				setVerifyBusyId(null);
			}
		},
		[api, store, addSpend],
	);

	const onRunVerification = useCallback(
		(rec: CaseRecord) => {
			const now = Date.now();
			if (verifyArm && verifyArm.id === rec.id && now - verifyArm.at < ARM_WINDOW_MS) {
				void doVerify(rec); // confirming second click
			} else {
				setActionError(null);
				setVerifyArm({ id: rec.id, at: now }); // arm
			}
		},
		[verifyArm, doVerify],
	);

	// --- 3. CHAT (cheap, ungated, fires immediately) ---------------------------
	const onAsk = useCallback(
		async (rec: CaseRecord, text: string) => {
			const history = rec.chat ?? [];
			store.appendChat(rec.id, [{ role: 'reviewer', text, at: new Date().toISOString() }]);
			setChatBusyId(rec.id);
			try {
				const answer = await api.askAboutCase(rec, text, history);
				store.appendChat(rec.id, [{ role: 'assistant', text: answer, at: new Date().toISOString() }]);
			} catch (e) {
				store.appendChat(rec.id, [
					{ role: 'assistant', text: `Error: ${msg(e)}`, at: new Date().toISOString() },
				]);
			} finally {
				setChatBusyId(null);
			}
		},
		[api, store],
	);

	// --- 4. APPROVE / REJECT (writeback, not gated) --------------------------
	const onDecision = useCallback(
		async (rec: CaseRecord, d: Decision) => {
			setDecisionBusyId(rec.id);
			setActionError(null);
			const who = reviewer.trim() || 'AP Analyst';
			try {
				await api.sendDecision(rec, d, who, '');
				store.recordDecision(rec.id, d, who, '', true);
			} catch (e) {
				store.recordDecision(rec.id, d, who, '', false); // record locally, mark writeback unacked
				setActionError(`Decision writeback failed: ${msg(e)}`);
			} finally {
				setDecisionBusyId(null);
			}
		},
		[api, store, reviewer],
	);

	const liveActions = !usingSamples; // verification + decisions only on real submitted cases

	// Error surface: prefer a friendly rewrite for known infra/auth/token failures,
	// keep the raw text reachable behind a details toggle.
	const rawErr = actionError ?? api.error ?? null;
	const fe = rawErr ? friendlyError(rawErr) : null;
	useEffect(() => {
		setErrDetails(false); // collapse details whenever the underlying error changes
	}, [rawErr]);

	return (
		<div className="mx-auto flex min-h-screen max-w-[1360px] flex-col px-5 py-5">
			{/* ---- top bar ---- */}
			<header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-4">
				<div className="flex items-center gap-2.5">
					<span className="grid h-7 w-7 place-items-center rounded-md border border-line bg-surface text-amber">
						<Search size={15} />
					</span>
					<div>
						<h1 className="text-[15px] font-semibold leading-none tracking-tight text-ink">Payment Fraud Sentinel</h1>
						<p className="mt-1 text-[11px] leading-none text-ink-faint">AP invoice fraud triage</p>
					</div>
				</div>

				<div className="flex items-baseline gap-1.5 border-l border-line pl-4">
					<span
						className="text-[20px] font-semibold leading-none tabular"
						style={{ color: needsAction > 0 ? '#F5B942' : '#9AA7B8' }}
					>
						{needsAction}
					</span>
					<span className="text-[11px] text-ink-dim">{needsAction === 1 ? 'case needs review' : 'cases need review'}</span>
				</div>

				<div className="ml-auto flex flex-wrap items-center gap-3 text-[11px]">
					<label className="inline-flex items-center gap-1.5 text-ink-faint">
						<span className="hidden sm:inline">Reviewer</span>
						<input
							value={reviewer}
							onChange={(e) => setReviewer(e.target.value)}
							aria-label="Reviewer name"
							placeholder="Your name"
							className="w-24 rounded border border-line bg-surface px-2 py-1 text-[11px] text-ink placeholder:text-ink-faint focus:border-ink-dim"
						/>
					</label>
					{!costHidden && (
						<span
							className="inline-flex items-center gap-1.5 rounded border border-line bg-surface px-2 py-1 text-ink-faint"
							title="Rough client-side estimate using midpoint per-call costs from live testing. Not real billing data."
						>
							~${estSpent.toFixed(2)} est. this session
							<button
								type="button"
								onClick={() => setCostHidden(true)}
								aria-label="Dismiss cost estimate"
								className="cursor-pointer text-ink-faint hover:text-ink"
							>
								<X size={11} />
							</button>
						</span>
					)}
					<span className="inline-flex items-center gap-1.5 text-ink-dim">
						<span style={{ color: isConnected && api.ready ? '#9AA7B8' : '#F5B942' }}>
							<Dot size={12} />
						</span>
						{!isConnected ? 'Not connected' : api.ready ? 'Pipeline ready' : 'Warming tasks…'}
					</span>
					{usingSamples && (
						<span
							className="rounded px-2 py-0.5 font-semibold uppercase tracking-wider"
							style={{ color: '#F5B942', background: 'rgba(245,158,11,0.14)' }}
						>
							Sample data
						</span>
					)}
				</div>
			</header>

			{/* ---- 1. submit ---- */}
			<div className="mt-4">
				<SubmitPanel
					ready={api.ready}
					notReadyReason={
						api.ready
							? undefined
							: api.error
							? friendlyError(api.error).friendly
							: !isConnected
							? 'still connecting'
							: 'warming pipeline tasks'
					}
					submitInvoices={api.submitInvoices}
					onCase={(rec) => store.addCases([rec])}
					onSpend={addSpend}
				/>
			</div>

			{fe && (
				<div
					className="mt-3 rounded-md border px-3 py-2 text-[11.5px]"
					style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#F87171' }}
				>
					<div className="flex items-start gap-2">
						<X size={12} className="mt-0.5 shrink-0" />
						<span className="flex-1">{fe.friendly}</span>
						{actionError && (
							<button
								type="button"
								onClick={() => setActionError(null)}
								className="cursor-pointer text-[11px] underline hover:no-underline"
							>
								dismiss
							</button>
						)}
					</div>
					{fe.translated && (
						<div className="mt-1 pl-[20px]">
							<button
								type="button"
								onClick={() => setErrDetails((v) => !v)}
								aria-expanded={errDetails}
								className="cursor-pointer text-[10.5px] uppercase tracking-wide text-ink-faint hover:text-ink-dim"
							>
								{errDetails ? 'Hide details' : 'Details'}
							</button>
							{errDetails && (
								<p className="mt-1 whitespace-pre-wrap break-words font-mono text-[10.5px] text-ink-faint">
									{fe.raw}
								</p>
							)}
						</div>
					)}
				</div>
			)}

			{/* ---- two-pane layout ---- */}
			<div className="mt-4 grid flex-1 gap-4 lg:grid-cols-[minmax(420px,0.9fr)_1.1fr]">
				<div className="min-h-0">
					<QueueDashboard cases={cases} selectedId={selectedId} onSelect={setSelectedId} />
				</div>

				<div ref={detailRef} className="min-h-0 scroll-mt-4">
					{selected ? (
						<CaseDetailPanel
							key={selected.id}
							rec={selected}
							onBack={() => setSelectedId(null)}
							sampleReason={liveActions ? undefined : SAMPLE_ACTION_NOTE}
							onDecision={liveActions ? (d) => void onDecision(selected, d) : undefined}
							decisionBusy={decisionBusyId === selected.id}
							onRunVerification={liveActions ? () => onRunVerification(selected) : undefined}
							verificationBusy={verifyBusyId === selected.id}
							verificationArmed={!!verifyArm && verifyArm.id === selected.id}
							onVerificationCancel={() => setVerifyArm(null)}
							onAsk={api.ready ? (text) => void onAsk(selected, text) : undefined}
							chatBusy={chatBusyId === selected.id}
							chatDisabledReason={api.ready ? undefined : 'Waiting for the pipeline connection…'}
						/>
					) : (
						<div className="flex h-full flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface px-6 py-16 text-center">
							<span className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-ink-dim">
								<Inbox size={20} />
							</span>
							<p className="mt-3 text-[13px] font-semibold text-ink">Select a case</p>
							<p className="mt-1 max-w-xs text-[12px] leading-relaxed text-ink-dim">
								Pick a case from the queue to open its investigation timeline, risk breakdown, assistant, and
								verification.
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default App;
