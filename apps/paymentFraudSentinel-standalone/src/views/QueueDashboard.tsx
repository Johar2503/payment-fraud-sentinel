// =============================================================================
// QueueDashboard — sortable table / card hybrid for the fraud triage queue.
//
// - Filter by status via clickable metric tiles (no dropdown).
// - Sort by risk / amount / received via clickable column headers.
// - Colour-coded left border per risk tier.
// - Live count that reflects the current filter + total.
// - Actionable empty states.
// =============================================================================

import React, { useMemo, useState } from 'react';
import type { CaseRecord, QueueStatus } from '../lib/types';
import { AlertTriangle, ArrowUpDown, ChevronDown, ChevronRight, ChevronUp, Inbox } from '../components/icons';
import { Chip, STATUS, TIER, money } from '../components/primitives';

type Filter = 'all' | QueueStatus;
type SortKey = 'risk' | 'amount' | 'received';
interface Sort {
	key: SortKey;
	dir: 'asc' | 'desc';
}

const TILE_ORDER: Filter[] = ['all', 'auto_hold', 'pending_review', 'auto_cleared'];
const TILE_LABEL: Record<Filter, string> = {
	all: 'All cases',
	auto_hold: 'Auto-hold',
	pending_review: 'Pending review',
	auto_cleared: 'Auto-cleared',
};

export interface QueueDashboardProps {
	cases: CaseRecord[];
	selectedId: string | null;
	onSelect: (id: string) => void;
}

export const QueueDashboard: React.FC<QueueDashboardProps> = ({ cases, selectedId, onSelect }) => {
	const [filter, setFilter] = useState<Filter>('all');
	const [sort, setSort] = useState<Sort>({ key: 'risk', dir: 'desc' });

	const counts = useMemo(() => {
		const c: Record<Filter, number> = { all: cases.length, auto_hold: 0, pending_review: 0, auto_cleared: 0 };
		for (const r of cases) c[r.case.queue_status]++;
		return c;
	}, [cases]);

	const rows = useMemo(() => {
		const filtered = filter === 'all' ? cases : cases.filter((r) => r.case.queue_status === filter);
		const dir = sort.dir === 'asc' ? 1 : -1;
		const val = (r: CaseRecord): number => {
			if (sort.key === 'risk') return r.case.risk.risk_score;
			if (sort.key === 'amount') return Number(r.case.invoice.amount) || 0;
			return new Date(r.receivedAt).getTime();
		};
		return [...filtered].sort((a, b) => (val(a) - val(b)) * dir);
	}, [cases, filter, sort]);

	const toggleSort = (key: SortKey): void =>
		setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

	const SortHead: React.FC<{ k: SortKey; children: React.ReactNode; className?: string }> = ({
		k,
		children,
		className = '',
	}) => (
		<button
			type="button"
			onClick={() => toggleSort(k)}
			className={`inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold uppercase tracking-wider ${
				sort.key === k ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'
			} ${className}`}
		>
			{children}
			{sort.key === k ? (
				sort.dir === 'asc' ? (
					<ChevronUp size={12} />
				) : (
					<ChevronDown size={12} />
				)
			) : (
				<ArrowUpDown size={12} />
			)}
		</button>
	);

	return (
		<div className="flex h-full flex-col">
			{/* metric tiles */}
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				{TILE_ORDER.map((key) => {
					const active = filter === key;
					const accent =
						key === 'auto_hold' ? '#F87171' : key === 'pending_review' ? '#F5B942' : key === 'auto_cleared' ? '#9AA7B8' : '#F8FAFC';
					// The auto-hold bucket is the one that must not be missed — give it a
					// standing danger wash whenever it's non-empty, active or not.
					const urgent = key === 'auto_hold' && counts.auto_hold > 0;
					return (
						<button
							key={key}
							type="button"
							aria-pressed={active}
							onClick={() => setFilter(active && key !== 'all' ? 'all' : key)}
							className="pfs-press flex flex-col items-start rounded-card border px-3 py-2.5 text-left"
							style={{
								borderColor: active ? accent : urgent ? 'rgba(239,68,68,0.45)' : '#334155',
								background: urgent ? 'rgba(239,68,68,0.08)' : '#222735',
								boxShadow: active ? `inset 0 -2px 0 ${accent}` : undefined,
							}}
						>
							<span
								className="text-[22px] font-semibold leading-none tabular"
								style={{ color: active || urgent ? accent : '#F8FAFC' }}
							>
								{counts[key]}
							</span>
							<span className="mt-1 text-[11px] uppercase tracking-wide text-ink-dim">{TILE_LABEL[key]}</span>
						</button>
					);
				})}
			</div>

			{/* priority call-out — only when something actually needs holding */}
			{counts.auto_hold > 0 && (
				<button
					type="button"
					onClick={() => setFilter('auto_hold')}
					className="pfs-press mt-2 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-[12px] font-medium"
					style={{ borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#F87171' }}
				>
					<span className="grid h-4 w-4 shrink-0 place-items-center rounded-full" style={{ background: 'rgba(239,68,68,0.2)' }}>
						<AlertTriangle size={10} />
					</span>
					{counts.auto_hold} {counts.auto_hold === 1 ? 'invoice is' : 'invoices are'} on auto-hold — review before any payment.
				</button>
			)}

			{/* header row */}
			<div className="mt-4 flex items-center justify-between px-1">
				<span className="text-[12px] text-ink-dim">
					<span className="font-semibold text-ink tabular">{rows.length}</span>
					{filter !== 'all' ? ` ${TILE_LABEL[filter].toLowerCase()}` : ''} of{' '}
					<span className="tabular">{cases.length}</span> {cases.length === 1 ? 'case' : 'cases'}
				</span>
				<div className="flex items-center gap-4">
					<SortHead k="risk">Risk</SortHead>
					<SortHead k="amount">Amount</SortHead>
					<SortHead k="received">Received</SortHead>
				</div>
			</div>

			{/* rows */}
			<div className="pfs-scroll mt-2 flex-1 space-y-2 overflow-y-auto pr-1">
				{cases.length === 0 ? (
					<EmptyAll />
				) : rows.length === 0 ? (
					<EmptyFilter label={TILE_LABEL[filter]} onReset={() => setFilter('all')} />
				) : (
					rows.map((r) => {
						const tier = TIER[r.case.risk.risk_level];
						const st = STATUS[r.case.queue_status];
						const selected = r.id === selectedId;
						const verified = r.verificationResult;
						const isHold = r.case.queue_status === 'auto_hold';
						return (
							<button
								key={r.id}
								type="button"
								onClick={() => onSelect(r.id)}
								aria-current={selected}
								className="pfs-row grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-card border px-3 py-3 text-left hover:border-ink-faint hover:bg-[rgba(248,250,252,0.025)]"
								style={{
									borderColor: selected ? tier.edge : '#334155',
									borderLeft: `4px solid ${tier.edge}`,
									background: selected
										? 'rgba(248,250,252,0.06)'
										: isHold
										? 'rgba(239,68,68,0.055)'
										: '#222735',
									boxShadow: selected ? `inset 0 0 0 1px ${tier.edge}` : undefined,
								}}
							>
								{/* risk */}
								<span className="flex w-16 flex-col items-start">
									<span className="text-[17px] font-semibold leading-none tabular" style={{ color: tier.fg }}>
										{r.case.risk.risk_score}
									</span>
									<span className="mt-1 text-[10px] uppercase tracking-wide" style={{ color: tier.fg }}>
										{tier.label}
									</span>
								</span>

								{/* vendor + invoice */}
								<span className="min-w-0">
									<span className="flex items-center gap-2">
										<span className="truncate text-[13.5px] font-semibold text-ink">{r.case.invoice.vendor_name}</span>
										{r.case.deterministic_hold && (
											<span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: '#F87171', background: 'rgba(239,68,68,0.14)' }}>
												Hold
											</span>
										)}
									</span>
									<span className="mt-0.5 flex items-center gap-2">
										<span className="font-mono text-[11px] text-ink-dim">{r.case.invoice.invoice_number || r.sourceFile}</span>
										{verified && (
											<span className="text-[10px] uppercase tracking-wide" style={{ color: verified.verification === 'suspicious' ? '#F5B942' : '#9AA7B8' }}>
												· verified: {verified.verification}
											</span>
										)}
										{r.decision && (
											<span className="text-[10px] uppercase tracking-wide text-ink-faint">· {r.decision.decision}d</span>
										)}
									</span>
								</span>

								{/* amount + status + chevron */}
								<span className="flex items-center gap-3">
									<span className="text-right">
										<span className="block text-[13px] font-semibold text-ink tabular">
											{money(r.case.invoice.amount, r.case.invoice.currency)}
										</span>
										<span className="mt-0.5 block">
											<Chip fg={st.fg} tint={st.tint}>
												{st.label}
											</Chip>
										</span>
									</span>
									<ChevronRight size={16} className="text-ink-faint" />
								</span>
							</button>
						);
					})
				)}
			</div>
		</div>
	);
};

const EmptyAll: React.FC = () => (
	<div className="flex flex-col items-center rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center">
		<span className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-ink-dim">
			<Inbox size={20} />
		</span>
		<p className="mt-3 text-[13px] font-semibold text-ink">The triage queue is empty</p>
		<p className="mt-1 max-w-xs text-[12px] leading-relaxed text-ink-dim">
			Submit invoice files from the panel above. Each one runs vendor lookup, deterministic rules, and risk scoring, then
			lands here for review.
		</p>
	</div>
);

const EmptyFilter: React.FC<{ label: string; onReset: () => void }> = ({ label, onReset }) => (
	<div className="flex flex-col items-center rounded-card border border-dashed border-line bg-surface px-6 py-10 text-center">
		<p className="text-[13px] font-semibold text-ink">No {label.toLowerCase()} cases</p>
		<p className="mt-1 text-[12px] text-ink-dim">Nothing in the queue currently matches this filter.</p>
		<button
			type="button"
			onClick={onReset}
			className="pfs-press mt-3 cursor-pointer rounded-md border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-ink-dim hover:border-ink-dim hover:text-ink"
		>
			Show all cases
		</button>
	</div>
);
