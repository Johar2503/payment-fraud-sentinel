// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

import React, { useMemo, useState } from 'react';
import {
	badgeEl,
	Button,
	BxChevronDown,
	BxChevronRight,
	Card,
	ContentHeader,
	DataGrid,
	EmptyState,
	MiniContainer,
} from 'shell';
import type { GridColumnDefinition } from 'shell';
import CaseDetail from '../components/CaseDetail';
import { ACCENT } from '../components/fx';
import { MetricCard, QUEUE_ACCENT } from '../components/MetricCard';
import PipelineSteps from '../components/PipelineSteps';
import { queueBucket, type CaseStore } from '../lib/cases';
import type { PipelineApi } from '../lib/pipeline';
import type { CaseRecord } from '../lib/types';

interface Row {
	[key: string]: unknown;
	id: string;
	invoice: string;
	vendor: string;
	amount: number;
	status: string;
	risk: string;
	riskScore: number;
	riskLevel: string;
	hold: boolean;
	verification: string;
	received: string;
}

const badge = (variant: 'success' | 'info' | 'warning' | 'error' | 'muted', label: string) => () =>
	badgeEl(variant, label);

// Green / amber / red by risk level — shared by the row's left border and the
// score meter so the grid scans at a glance.
const RISK_COLOR: Record<string, string> = {
	low: 'var(--rr-color-success, #16a34a)',
	medium: ACCENT.amber,
	high: ACCENT.amber,
	critical: 'var(--rr-color-error, #dc2626)',
};

/** Animated horizontal score meter for the Risk cell (fills from 0 on render). */
function riskMeterEl(score: number, level: string): HTMLElement {
	const wrap = document.createElement('span');
	const meter = document.createElement('span');
	meter.className = 'pfs-meter';
	const fill = document.createElement('i');
	fill.style.background = RISK_COLOR[level] ?? 'var(--rr-text-secondary)';
	meter.appendChild(fill);
	const num = document.createElement('span');
	num.className = 'pfs-meter-num';
	num.textContent = String(score);
	wrap.appendChild(meter);
	wrap.appendChild(num);
	const pct = Math.max(2, Math.min(100, score));
	requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${pct}%`)));
	return wrap;
}

interface GridCellLike {
	getRow: () => { getData: () => Row };
}
interface GridRowLike {
	getData: () => Row;
	getElement: () => HTMLElement;
}

function toRow(rec: CaseRecord): Row {
	const c = rec.case;
	const verification = rec.decision
		? 'decided'
		: rec.verificationResult
			? rec.verificationResult.verification
			: c.verification.status;
	return {
		id: rec.id,
		invoice: c.invoice.invoice_number || rec.sourceFile,
		vendor: c.invoice.vendor_name,
		amount: Number(c.invoice.amount) || 0,
		status: rec.decision ? `${rec.decision.decision}ed` : c.queue_status,
		risk: `${c.risk.risk_level} ${c.risk.risk_score}`,
		riskScore: c.risk.risk_score,
		riskLevel: c.risk.risk_level,
		hold: c.deterministic_hold,
		verification,
		received: rec.receivedAt,
	};
}

interface Props {
	store: CaseStore;
	api: PipelineApi;
	reviewer: string;
	onSubmitNav: () => void;
}

type Bucket = 'review' | 'hold' | 'cleared' | 'decided';

const QueueView: React.FC<Props> = ({ store, api, reviewer, onSubmitNav }) => {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [activeBucket, setActiveBucket] = useState<Bucket | null>(null);
	const [howOpen, setHowOpen] = useState(false);
	const toggleBucket = (b: Bucket) => setActiveBucket((cur) => (cur === b ? null : b));

	const counts = useMemo(() => {
		const acc = { review: 0, hold: 0, cleared: 0, decided: 0 };
		for (const rec of store.cases) acc[queueBucket(rec)]++;
		return acc;
	}, [store.cases]);

	// Clicking a metric tile filters the grid to that bucket (client-side on the
	// `data` array — no Tabulator filter API needed). Tile counts stay full.
	const visibleCases = useMemo(
		() => (activeBucket ? store.cases.filter((r) => queueBucket(r) === activeBucket) : store.cases),
		[store.cases, activeBucket],
	);
	const rows = useMemo(() => visibleCases.map(toRow), [visibleCases]);
	const selected = useMemo(
		() => store.cases.find((r) => r.id === selectedId) ?? null,
		[store.cases, selectedId],
	);

	const columns = useMemo<GridColumnDefinition[]>(
		() => [
			{ title: 'Invoice', field: 'invoice', rrType: 'string', rrDefault: true, rrDescription: 'Invoice number (or source file when none was extracted).' },
			{ title: 'Vendor', field: 'vendor', rrType: 'string', rrDefault: true, rrDescription: 'Vendor name as extracted from the invoice.' },
			{
				title: 'Amount',
				field: 'amount',
				rrType: 'number',
				rrDefault: true,
				rrDescription: 'Invoice total amount.',
				formatter: (cell) => Number(cell.getValue()).toLocaleString(undefined, { minimumFractionDigits: 2 }),
				hozAlign: 'right',
			},
			{
				title: 'Queue',
				field: 'status',
				rrType: 'enum',
				rrDefault: true,
				rrOptions: ['auto_cleared', 'pending_review', 'auto_hold', 'approveed', 'rejected'],
				rrDescription: 'Triage outcome: auto_cleared, pending_review, auto_hold, or the human decision.',
				formatter: (cell) => {
					const v = String(cell.getValue());
					const map: Record<string, 'success' | 'warning' | 'error' | 'muted'> = {
						auto_cleared: 'success',
						pending_review: 'warning',
						auto_hold: 'error',
						approveed: 'success',
						rejected: 'error',
					};
					return badge(map[v] ?? 'muted', v.replace(/_/g, ' ').replace('approveed', 'approved'))();
				},
			},
			{
				title: 'Risk',
				field: 'risk',
				rrType: 'string',
				rrDefault: true,
				rrDescription: 'Risk level and score (0–100) from the agent assessment, shown as a coloured meter.',
				headerSort: true,
				formatter: (cell) => {
					const d = (cell as unknown as GridCellLike).getRow().getData();
					return riskMeterEl(d.riskScore, d.riskLevel);
				},
			},
			{
				title: 'Hold',
				field: 'hold',
				rrType: 'boolean',
				rrDefault: true,
				rrDescription: 'Whether the deterministic HOLD rule fired (bank unknown + amount > 2× mean + vendor < 30 days).',
				formatter: (cell) => (cell.getValue() ? badge('error', 'HOLD')() : badge('muted', '—')()),
			},
			{
				title: 'Verification',
				field: 'verification',
				rrType: 'enum',
				rrDefault: true,
				rrOptions: ['not_required', 'pending', 'confirmed', 'suspicious', 'decided'],
				rrDescription: 'Async out-of-band vendor verification state.',
				formatter: (cell) => {
					const v = String(cell.getValue());
					const map: Record<string, 'success' | 'info' | 'warning' | 'error' | 'muted'> = {
						confirmed: 'success',
						suspicious: 'error',
						pending: 'warning',
						not_required: 'muted',
						decided: 'info',
					};
					return badge(map[v] ?? 'muted', v.replace(/_/g, ' '))();
				},
			},
			{
				title: 'Received',
				field: 'received',
				rrType: 'date',
				rrDefault: true,
				rrDefaultSort: 'desc',
				rrDescription: 'When the invoice was submitted to the queue.',
				formatter: (cell) => new Date(String(cell.getValue())).toLocaleString(),
			},
		],
		[],
	);

	// Colour-coded left border per row, keyed to risk level.
	const gridOptions = useMemo(
		() => ({
			rowFormatter: (row: GridRowLike) => {
				const d = row.getData();
				row.getElement().style.borderLeft = `3px solid ${RISK_COLOR[d.riskLevel] ?? 'transparent'}`;
			},
		}),
		[],
	);

	return (
		<div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
			<ContentHeader
				title="Approval queue"
				subtitle="Invoices triaged by Payment Fraud Sentinel. Review anything not auto-cleared."
				actions={<Button onClick={onSubmitNav}>Submit invoices</Button>}
			/>

			<div>
				<span
					className="pfs-focus"
					role="button"
					tabIndex={0}
					aria-expanded={howOpen}
					onClick={() => setHowOpen((v) => !v)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							setHowOpen((v) => !v);
						}
					}}
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 4,
						cursor: 'pointer',
						userSelect: 'none',
						fontSize: 11,
						fontWeight: 700,
						letterSpacing: '0.06em',
						textTransform: 'uppercase',
						color: 'var(--rr-text-secondary)',
					}}
				>
					{howOpen ? <BxChevronDown size={15} /> : <BxChevronRight size={15} />}
					How this works
				</span>
				{howOpen && (
					<Card>
						<div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--rr-text-secondary)', marginBottom: 4 }}>
							Every submitted invoice runs the same four-stage triage before it reaches this queue.
						</div>
						<PipelineSteps />
					</Card>
				)}
			</div>

			<MiniContainer>
				<MetricCard value={counts.review} label="Pending review" accent={QUEUE_ACCENT.review} active={activeBucket === 'review'} onClick={() => toggleBucket('review')} />
				<MetricCard value={counts.hold} label="Auto-hold" accent={QUEUE_ACCENT.hold} active={activeBucket === 'hold'} onClick={() => toggleBucket('hold')} />
				<MetricCard value={counts.cleared} label="Auto-cleared" accent={QUEUE_ACCENT.cleared} active={activeBucket === 'cleared'} onClick={() => toggleBucket('cleared')} />
				<MetricCard value={counts.decided} label="Decided" active={activeBucket === 'decided'} onClick={() => toggleBucket('decided')} />
			</MiniContainer>

			<Card fill noBodyPadding>
				{rows.length === 0 ? (
					<EmptyState
						title={activeBucket ? 'Nothing in this view' : 'All clear'}
						description={
							activeBucket
								? 'No cases match the selected filter.'
								: 'No payments flagged for review right now. Submit supplier invoices to run fraud triage.'
						}
						action={
							activeBucket ? (
								<Button onClick={() => setActiveBucket(null)}>Show all cases</Button>
							) : (
								<Button onClick={onSubmitNav}>Submit invoices</Button>
							)
						}
					/>
				) : (
					<div className="pfs-grid" style={{ height: '100%' }}>
						<DataGrid
							tableId="pfs-queue"
							title="Cases"
							columns={columns}
							data={rows}
							height="100%"
							options={gridOptions as never}
							onRowClick={(row) => setSelectedId((row as Row).id)}
						/>
					</div>
				)}
			</Card>

			<CaseDetail
				rec={selected}
				reviewer={reviewer}
				api={api}
				store={store}
				onClose={() => setSelectedId(null)}
			/>
		</div>
	);
};

export default QueueView;
