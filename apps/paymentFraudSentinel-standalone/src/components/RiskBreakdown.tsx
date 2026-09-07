// =============================================================================
// RiskBreakdown — decomposes the risk score into its contributing signals
// instead of showing a lone number. A proportional segmented bar (weighted by
// derived severity) plus a per-signal list with icon + severity + evidence.
//
// Severity is a DISPLAY heuristic derived from the flag type — the pipeline
// does not emit per-flag points — so the bar shows *relative* contribution,
// not exact score arithmetic. Labelled as such.
// =============================================================================

import React from 'react';
import type { RiskFlag, RiskLevel } from '../lib/types';
import { TIER } from './primitives';
import { AlertTriangle, Ban, Building, Clock, FileText, Search } from './icons';

type Sev = 'critical' | 'high' | 'medium' | 'low';

const SEV_META: Record<Sev, { label: string; weight: number; fg: string; bar: string; tint: string }> = {
	critical: { label: 'Critical', weight: 4, fg: '#F87171', bar: '#EF4444', tint: 'rgba(239,68,68,0.14)' },
	high: { label: 'High', weight: 3, fg: '#F5B942', bar: '#F59E0B', tint: 'rgba(245,158,11,0.16)' },
	medium: { label: 'Medium', weight: 2, fg: '#F5B942', bar: '#F59E0B', tint: 'rgba(245,158,11,0.10)' },
	low: { label: 'Low', weight: 1, fg: '#CBD5E1', bar: '#64748B', tint: 'rgba(100,116,139,0.14)' },
};

function severityOf(type: string): Sev {
	const t = type.toLowerCase();
	if (/(unknown_payee|bank).*(account|mismatch)|payee_bank|account.*(unknown|mismatch)/.test(t)) return 'critical';
	if (/wire|same_day|bank_change/.test(t)) return 'critical';
	if (/amount_outlier|missing_po|outlier|large_amount/.test(t)) return 'high';
	if (/urgency|urgent|no_bank_change_notice/.test(t)) return 'high';
	if (/new_vendor|round_sum|weekend|short_payment|first_seen/.test(t)) return 'medium';
	return 'low';
}

function iconFor(type: string): React.FC<{ size?: number; className?: string }> {
	const t = type.toLowerCase();
	if (/bank|account|payee|wire/.test(t)) return Ban;
	if (/amount|outlier|round_sum/.test(t)) return AlertTriangle;
	if (/vendor|new_vendor|first_seen/.test(t)) return Building;
	if (/urgen|weekend|short_payment|window/.test(t)) return Clock;
	if (/po|purchase|line_item|category|document/.test(t)) return FileText;
	return Search;
}

const titleCase = (s: string): string =>
	s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const RiskBreakdown: React.FC<{ score: number; level: RiskLevel; flags: RiskFlag[] }> = ({
	score,
	level,
	flags,
}) => {
	const tier = TIER[level];
	const rows = flags.map((f) => {
		const sev = severityOf(f.type);
		return { flag: f, sev, meta: SEV_META[sev] };
	});
	const totalWeight = rows.reduce((s, r) => s + r.meta.weight, 0) || 1;

	return (
		<div>
			<div className="flex items-end justify-between">
				<div className="flex items-baseline gap-2">
					<span className="text-3xl font-semibold tabular" style={{ color: tier.fg }}>
						{score}
					</span>
					<span className="text-sm text-ink-faint">/ 100</span>
					<span className="ml-1 text-sm font-medium" style={{ color: tier.fg }}>
						{tier.label} risk
					</span>
				</div>
				<span className="text-[12px] text-ink-dim">
					{flags.length} contributing {flags.length === 1 ? 'signal' : 'signals'}
				</span>
			</div>

			{/* proportional segmented bar */}
			<div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2" role="presentation">
				{rows.map((r, i) => (
					<div
						key={i}
						className="h-full"
						style={{
							width: `${(r.meta.weight / totalWeight) * 100}%`,
							background: r.meta.bar,
							boxShadow: i > 0 ? 'inset 1px 0 0 rgba(15,23,42,0.55)' : undefined,
						}}
						title={`${titleCase(r.flag.type)} — ${r.meta.label}`}
					/>
				))}
			</div>
			<p className="mt-1.5 text-[11px] italic text-ink-faint">
				Segments show each signal’s relative weight (by severity), not exact score points.
			</p>

			{/* per-signal list */}
			<ul className="mt-3 space-y-2">
				{rows.map((r, i) => {
					const Icon = iconFor(r.flag.type);
					return (
						<li
							key={i}
							className="rounded-md border border-line bg-surface-2 p-3"
							style={{ borderLeft: `3px solid ${r.meta.bar}` }}
						>
							<div className="flex items-center gap-2">
								<span className="grid h-6 w-6 place-items-center rounded" style={{ color: r.meta.fg, background: r.meta.tint }}>
									<Icon size={14} />
								</span>
								<span className="text-[13px] font-medium text-ink">{titleCase(r.flag.type)}</span>
								<span
									className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
									style={{ color: r.meta.fg, background: r.meta.tint }}
								>
									{r.meta.label}
								</span>
							</div>
							<p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-dim">{r.flag.evidence}</p>
						</li>
					);
				})}
			</ul>
		</div>
	);
};
