// =============================================================================
// InvestigationTimeline — the four triage stages as an independently
// expandable vertical stepper: vendor lookup -> deterministic rules -> risk
// assessment -> verification. A genuine sequence, so numbered 01–04.
//
// Each stage owns its open state: expanding one never collapses another.
// Analyst-facing: each stage shows a plain-language line plus a structured
// summary (vendor details, rule pass/fail). No raw query / script is surfaced.
// =============================================================================

import React, { useState } from 'react';
import type { CaseRecord, RiskLevel } from '../lib/types';
import { VerificationView } from './VerificationView';
import { ChevronDown, ChevronRight, Phone } from './icons';
import { Chip, KeyVal, PassFail, StageMark, TIER, money } from './primitives';

export interface InvestigationTimelineProps {
	rec: CaseRecord;
	onRunVerification?: () => void;
	verificationBusy?: boolean;
	/** first click arms; while armed the button asks for a confirming second click */
	verificationArmed?: boolean;
	onVerificationCancel?: () => void;
	/** when set, the Run verification action is replaced by this note */
	verificationDisabledReason?: string;
}

interface StageDef {
	n: string;
	title: string;
	line: string;
	mark: 'ok' | 'flag' | 'idle' | 'score';
	/** risk tier for `mark: 'score'` — colours the gauge dot */
	tone?: RiskLevel;
	body: React.ReactNode;
}

const Stage: React.FC<{ def: StageDef; last: boolean; defaultOpen?: boolean }> = ({ def, last, defaultOpen }) => {
	const [open, setOpen] = useState(!!defaultOpen);
	return (
		<li className="relative pl-9">
			{!last && <span className="absolute left-3 top-7 h-[calc(100%+0.75rem)] w-px -translate-x-1/2 bg-line" aria-hidden />}
			<span className="absolute left-3 top-1 -translate-x-1/2">
				<StageMark state={def.mark} tone={def.tone} />
			</span>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="pfs-row flex w-full items-start gap-3 rounded-md border border-line bg-surface px-3 py-2.5 text-left hover:border-ink-faint"
			>
				<span className="mt-0.5 shrink-0 text-ink-faint">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
				<span className="min-w-0 flex-1">
					<span className="flex items-center gap-2">
						<span className="font-mono text-[11px] text-ink-faint">{def.n}</span>
						<span className="text-[13px] font-semibold text-ink">{def.title}</span>
					</span>
					<span className="mt-0.5 block text-[12px] leading-relaxed text-ink-dim">{def.line}</span>
				</span>
			</button>
			<div className="pfs-expand" data-open={open}>
				<div className="pfs-expand-inner">
					<div className="px-1 py-3">{def.body}</div>
				</div>
			</div>
		</li>
	);
};

export const InvestigationTimeline: React.FC<InvestigationTimelineProps> = ({
	rec,
	onRunVerification,
	verificationBusy,
	verificationArmed,
	onVerificationCancel,
	verificationDisabledReason,
}) => {
	const c = rec.case;
	const v = c.vendor;
	const tier = TIER[c.risk.risk_level];

	const ruleA = c.rules_fired.includes('bank_account_not_known');
	const ruleB = c.rules_fired.includes('amount_over_2x_mean');
	const ruleC = c.rules_fired.includes('vendor_first_seen_within_30_days');

	const verified = rec.verificationResult;

	const stages: StageDef[] = [
		{
			n: '01',
			title: 'Vendor lookup',
			mark: v.found ? 'ok' : 'flag',
			line: v.found
				? `Matched ${v.vendor_id ?? 'vendor'} · mean invoice ${money(v.mean_amount)} · ${
						v.bank_account_known ? 'remit account on file' : 'remit account NOT on file'
				  } · first seen ${v.days_since_first_seen ?? '—'} days ago`
				: 'No matching vendor in the master file.',
			body: (
				<div className="rounded-md border border-line bg-surface-2 px-3 py-1">
					<KeyVal k="Vendor ID" v={v.vendor_id ?? '—'} mono />
					<KeyVal k="Found in master" v={v.found ? 'Yes' : 'No'} />
					<KeyVal k="Mean invoice amount" v={money(v.mean_amount)} />
					<KeyVal k="Remit account known" v={v.bank_account_known ? 'Yes' : 'No — mismatch'} />
					<KeyVal k="Amount over 2× mean" v={v.amount_over_2x_mean ? 'Yes' : 'No'} />
					<KeyVal k="Days since first seen" v={v.days_since_first_seen ?? '—'} />
				</div>
			),
		},
		{
			n: '02',
			title: 'Deterministic rules',
			mark: c.deterministic_hold ? 'flag' : c.rules_fired.length ? 'flag' : 'ok',
			line: c.deterministic_hold
				? `Auto-hold — all ${c.rules_fired.length} hold rules fired`
				: c.rules_fired.length
				? `${c.rules_fired.length} of 3 hold rules fired — no auto-hold (all three required)`
				: 'No hold rules fired',
			body: (
				<div className="space-y-2 rounded-md border border-line bg-surface-2 px-3 py-3">
					<PassFail ok={ruleA} label="Rule a — remit account not in vendor master" />
					<PassFail ok={ruleB} label="Rule b — invoice amount over 2× vendor mean" />
					<PassFail ok={ruleC} label="Rule c — vendor first seen within 30 days" />
					<div className="mt-2 border-t border-line pt-2 text-[12px]">
						<span className="text-ink-dim">deterministic_hold = </span>
						<span className="font-mono font-semibold" style={{ color: c.deterministic_hold ? '#F87171' : '#9AA7B8' }}>
							{String(c.deterministic_hold)}
						</span>
						<span className="text-ink-faint"> (rule a AND rule b AND rule c)</span>
					</div>
				</div>
			),
		},
		{
			n: '03',
			title: 'Risk assessment',
			// A score (0–100), not a pass/fail — mark it with the tier-coloured gauge, never check/✕.
			mark: 'score',
			tone: c.risk.risk_level,
			line: `Score ${c.risk.risk_score}/100 · ${tier.label} · ${c.risk.flags.length} contributing ${
				c.risk.flags.length === 1 ? 'signal' : 'signals'
			}`,
			body: (
				<div className="space-y-2">
					<div className="flex items-baseline gap-2">
						<span className="text-2xl font-semibold tabular" style={{ color: tier.fg }}>
							{c.risk.risk_score}
						</span>
						<span className="text-[12px] text-ink-faint">/ 100 · {tier.label}</span>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{c.risk.flags.slice(0, 6).map((f, i) => (
							<Chip key={i} fg={tier.fg} tint={tier.tint}>
								{f.type.replace(/[_-]+/g, ' ')}
							</Chip>
						))}
						{c.risk.flags.length > 6 && <Chip>+{c.risk.flags.length - 6} more</Chip>}
					</div>
					<p className="text-[11.5px] italic text-ink-faint">Full decomposition in the Risk breakdown section below.</p>
				</div>
			),
		},
		{
			n: '04',
			title: 'Verification',
			mark: verified ? (verified.verification === 'suspicious' ? 'flag' : 'ok') : 'idle',
			line: verified
				? `Simulated call complete — outcome: ${verified.verification}`
				: c.verification.status === 'pending'
				? 'Required — not yet run'
				: 'Not required for this case',
			body: verified ? (
				<VerificationView result={verified} />
			) : (
				<div className="rounded-md border border-line bg-surface-2 px-3 py-4 text-[12.5px] text-ink-dim">
					{verificationDisabledReason ? (
						<p className="italic text-ink-faint">{verificationDisabledReason}</p>
					) : c.verification.status === 'pending' ? (
						<div className="flex flex-wrap items-center gap-3">
							<span>An out-of-band vendor verification call is required before any payment action.</span>
							{onRunVerification &&
								(verificationArmed ? (
									<span className="inline-flex items-center gap-2">
										<button
											type="button"
											onClick={onRunVerification}
											disabled={verificationBusy}
											className="pfs-press inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-surface px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
											style={{ borderColor: '#F59E0B', color: '#F59E0B' }}
										>
											<Phone size={13} />
											{verificationBusy ? 'Running…' : 'Confirm verification'}
										</button>
										{!verificationBusy && onVerificationCancel && (
											<button
												type="button"
												onClick={onVerificationCancel}
												className="cursor-pointer text-[12px] font-medium text-ink-dim hover:text-ink"
											>
												Cancel
											</button>
										)}
									</span>
								) : (
									<button
										type="button"
										onClick={onRunVerification}
										disabled={verificationBusy}
										className="pfs-press inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink hover:border-ink-dim disabled:opacity-40"
									>
										<Phone size={13} className="text-ink-dim" />
										{verificationBusy ? 'Running…' : 'Run verification'}
									</button>
								))}
						</div>
					) : (
						<span>No anomalies warranting a vendor call — this case cleared deterministic and risk checks.</span>
					)}
				</div>
			),
		},
	];

	// Open the decision-driving stage on mount so the panel isn't four collapsed
	// one-liners: the hold rules when they fired, otherwise the risk assessment.
	const keyStage = c.deterministic_hold ? '02' : '03';

	return (
		<ol className="space-y-1.5">
			{stages.map((s, i) => (
				<Stage key={s.n} def={s} last={i === stages.length - 1} defaultOpen={s.n === keyStage} />
			))}
		</ol>
	);
};
