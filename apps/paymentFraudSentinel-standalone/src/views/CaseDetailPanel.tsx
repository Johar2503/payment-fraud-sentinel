// =============================================================================
// CaseDetailPanel — the full investigation view for one case.
//
// One orchestrated reveal on open (`.pfs-reveal`, staggered via --i). Nothing
// else animates on load; expansions and the approve/reject press respond to
// the analyst's action only.
// =============================================================================

import React, { useEffect, useState } from 'react';
import type { CaseRecord, ChatMessage } from '../lib/types';
import { ChatAssistant } from '../components/ChatAssistant';
import { InvestigationTimeline } from '../components/InvestigationTimeline';
import { RiskBreakdown } from '../components/RiskBreakdown';
import { Ban, Check, ChevronRight } from '../components/icons';
import { Chip, KeyVal, Panel, SectionLabel, STATUS, TIER, money } from '../components/primitives';

export interface CaseDetailPanelProps {
	rec: CaseRecord;
	onBack?: () => void;
	onDecision?: (d: 'approve' | 'reject') => void;
	decisionBusy?: boolean;
	onRunVerification?: () => void;
	verificationBusy?: boolean;
	verificationArmed?: boolean;
	onVerificationCancel?: () => void;
	/** note shown on the (disabled) decision + verification actions, e.g. for sample cases */
	sampleReason?: string;
	onAsk?: (text: string) => void;
	chatBusy?: boolean;
	/** independent of sampleReason — chat is cheap/ungated and may stay live for samples */
	chatDisabledReason?: string;
}

/** stagger order for the one orchestrated reveal (CSS custom prop) */
const rv = (i: number): React.CSSProperties => ({ '--i': i }) as React.CSSProperties;

export const CaseDetailPanel: React.FC<CaseDetailPanelProps> = ({
	rec,
	onBack,
	onDecision,
	decisionBusy,
	onRunVerification,
	verificationBusy,
	verificationArmed,
	onVerificationCancel,
	sampleReason,
	onAsk,
	chatBusy,
	chatDisabledReason,
}) => {
	const c = rec.case;
	const tier = TIER[c.risk.risk_level];
	const st = STATUS[c.queue_status];
	const decided = rec.decision;
	const amt = c.amount_analysis;
	const chat: ChatMessage[] = rec.chat ?? [];

	// Which decision (if any) the analyst just clicked — drives the "Recording…" label.
	const [pendingDecision, setPendingDecision] = useState<'approve' | 'reject' | null>(null);
	useEffect(() => {
		if (!decisionBusy) setPendingDecision(null);
	}, [decisionBusy]);

	return (
		<div className="pfs-reveal flex h-full flex-col gap-4 overflow-y-auto pfs-scroll pr-1">
			{/* ---- status banner ---- */}
			<div
				key={rec.id}
				style={{ ...rv(0), background: tier.tint, borderColor: tier.edge }}
				className="rounded-card border px-4 py-4"
			>
				{onBack && (
					<button
						type="button"
						onClick={onBack}
						className="mb-2 inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-ink-dim hover:text-ink lg:hidden"
					>
						<ChevronRight size={12} className="rotate-180" />
						Back to queue
					</button>
				)}
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<div className="flex items-baseline gap-2">
							<span className="text-2xl font-bold tracking-tight" style={{ color: tier.fg }}>
								{tier.label} risk
							</span>
							<span className="text-lg font-semibold tabular text-ink-dim">{c.risk.risk_score}/100</span>
						</div>
						<div className="mt-1.5 text-[15px] font-semibold text-ink">{c.invoice.vendor_name}</div>
						<div className="mt-1 flex flex-wrap items-center gap-2">
							<span className="rounded border border-line bg-surface-2 px-2 py-0.5 font-mono text-[12px] text-ink-dim">
								{c.invoice.invoice_number || rec.sourceFile}
							</span>
							<span className="text-[13px] font-semibold text-ink tabular">
								{money(c.invoice.amount, c.invoice.currency)}
							</span>
						</div>
					</div>
					<div className="flex flex-col items-end gap-2">
						<Chip fg={st.fg} tint={st.tint}>
							{st.label}
						</Chip>
						{c.deterministic_hold && (
							<Chip fg="#F87171" tint="rgba(239,68,68,0.14)">
								Deterministic hold
							</Chip>
						)}
					</div>
				</div>

				{/* decision bar */}
				<div className="mt-4 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
					{decided ? (
						<div className="flex items-center gap-2 text-[12.5px]">
							<span
								className="inline-flex items-center gap-1.5 rounded px-2 py-1 font-semibold uppercase tracking-wide"
								style={
									decided.decision === 'approve'
										? { color: '#9AA7B8', background: 'rgba(154,167,184,0.14)' }
										: { color: '#F87171', background: 'rgba(239,68,68,0.14)' }
								}
							>
								{decided.decision === 'approve' ? <Check size={13} /> : <Ban size={13} />}
								{decided.decision === 'approve' ? 'Approved' : 'Rejected'}
							</span>
							<span className="text-ink-dim">
								by {decided.reviewer} · {new Date(decided.decidedAt).toLocaleString()}
								{decided.acked ? '' : ' · writeback pending'}
							</span>
						</div>
					) : (
						<div className="flex flex-wrap items-center gap-2">
							<button
								type="button"
								onClick={() => {
									setPendingDecision('approve');
									onDecision?.('approve');
								}}
								disabled={decisionBusy || !onDecision}
								className="pfs-press inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:border-ink-dim disabled:cursor-not-allowed disabled:opacity-40"
							>
								<Check size={14} />
								{pendingDecision === 'approve' ? 'Recording…' : 'Approve payment'}
							</button>
							<button
								type="button"
								onClick={() => {
									setPendingDecision('reject');
									onDecision?.('reject');
								}}
								disabled={decisionBusy || !onDecision}
								className="pfs-press inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
								style={{ background: '#EF4444' }}
							>
								<Ban size={14} />
								{pendingDecision === 'reject' ? 'Recording…' : 'Reject'}
							</button>
							{sampleReason && <span className="text-[11px] italic text-ink-faint">{sampleReason}</span>}
						</div>
					)}
				</div>
			</div>

			{/* ---- investigation timeline ---- */}
			<Panel className="p-4" style={rv(1)}>
				<div>
					<SectionLabel>Investigation timeline</SectionLabel>
					<InvestigationTimeline
						rec={rec}
						onRunVerification={onRunVerification}
						verificationBusy={verificationBusy}
						verificationArmed={verificationArmed}
						onVerificationCancel={onVerificationCancel}
						verificationDisabledReason={sampleReason}
					/>
				</div>
			</Panel>

			{/* ---- risk breakdown ---- */}
			<Panel className="p-4" style={rv(2)}>
				<div>
					<SectionLabel>Risk breakdown</SectionLabel>
					<RiskBreakdown score={c.risk.risk_score} level={c.risk.risk_level} flags={c.risk.flags} />
				</div>
			</Panel>

			{/* ---- amount analysis ---- */}
			{amt && (
				<Panel className="p-4" style={rv(3)}>
					<div>
						<SectionLabel>Amount analysis</SectionLabel>
						<div className="rounded-md border border-line bg-surface-2 px-3 py-1">
							<KeyVal k="Invoice amount" v={money(amt.invoice_amount)} />
							<KeyVal k="Vendor mean amount" v={money(amt.vendor_mean_amount)} />
							<KeyVal
								k="Ratio vs mean"
								v={amt.ratio_vs_mean != null ? `${amt.ratio_vs_mean.toFixed(2)}×` : '—'}
							/>
							<KeyVal k="Over 2× mean" v={amt.over_2x_mean ? 'Yes' : 'No'} />
						</div>
					</div>
				</Panel>
			)}

			{/* ---- summary ---- */}
			<Panel className="p-4" style={rv(4)}>
				<div>
					<SectionLabel>Agent summary</SectionLabel>
					<p className="text-[12.5px] leading-relaxed text-ink-dim">{c.summary}</p>
				</div>
			</Panel>

			{/* ---- chat ---- */}
			<div style={rv(5)}>
				<ChatAssistant messages={chat} onSend={onAsk} busy={chatBusy} disabledReason={chatDisabledReason} />
			</div>
		</div>
	);
};
