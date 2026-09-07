// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

import React, { useMemo, useState } from 'react';
import {
	Banner,
	Button,
	BxCloudUpload,
	BxShow,
	Card,
	ContentHeader,
	DropZone,
	MiniContainer,
	StatusBadge,
} from 'shell';
import { MetricCard, QUEUE_ACCENT } from '../components/MetricCard';
import PipelineSteps from '../components/PipelineSteps';
import { useToast } from '../components/Toast';
import { queueBucket, type CaseStore } from '../lib/cases';
import type { PipelineApi } from '../lib/pipeline';

const QUEUE_TOAST: Record<string, 'success' | 'info' | 'warning' | 'error'> = {
	auto_cleared: 'success',
	pending_review: 'warning',
	auto_hold: 'error',
};

interface Props {
	store: CaseStore;
	api: PipelineApi;
	onDone: () => void;
}

interface RunLine {
	name: string;
	ok: boolean;
	detail: string;
}

const styles: Record<string, React.CSSProperties> = {
	page: { padding: 24, display: 'flex', flexDirection: 'column', gap: 16, height: '100%' },
	// The upload card is short; center it in the leftover space so the screen
	// reads as composed rather than top-heavy. `margin: auto` centers when it
	// fits and falls back to top-aligned scroll when the run card makes it tall.
	centerArea: { flex: 1, minHeight: 0, display: 'flex', overflowY: 'auto' },
	stack: { margin: 'auto', width: '100%', maxWidth: 1040, display: 'flex', flexDirection: 'column', gap: 16 },
	// upload card + activity panel side by side on wide screens, wrapping on narrow.
	row: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
	colMain: { flex: '3 1 460px', minWidth: 0 },
	colAside: { flex: '1 1 240px' },
	lines: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 },
	line: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 },
	note: { fontSize: 12, color: 'var(--rr-text-secondary)', marginTop: 10 },
	dropWrap: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		gap: 6,
		padding: 18,
		borderRadius: 10,
		border: '2px dashed transparent',
		boxSizing: 'border-box',
		background: 'var(--rr-bg-secondary, rgba(0,0,0,0.025))',
		transition: 'border-color 0.15s ease, background-color 0.15s ease',
	},
	dropWrapActive: {
		borderColor: 'var(--rr-color-info, #2563eb)',
		background: 'rgba(37, 99, 235, 0.07)',
	},
	callout: {
		display: 'flex',
		gap: 8,
		alignItems: 'flex-start',
		marginTop: 12,
		padding: '10px 12px',
		borderRadius: 8,
		borderLeft: '3px solid var(--rr-color-info, #2563eb)',
		background: 'rgba(37, 99, 235, 0.07)',
		fontSize: 12,
		lineHeight: 1.5,
		color: 'var(--rr-text-secondary)',
	},
};

const SubmitView: React.FC<Props> = ({ store, api, onDone }) => {
	const toast = useToast();
	const [busy, setBusy] = useState(false);
	const [progress, setProgress] = useState<string | null>(null);
	const [lines, setLines] = useState<RunLine[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [dragging, setDragging] = useState(false);

	const handleFiles = async (fileList: FileList) => {
		const files = Array.from(fileList);
		if (files.length === 0) return;
		setBusy(true);
		setError(null);
		setLines([]);
		setProgress(`Queued ${files.length} file${files.length > 1 ? 's' : ''}…`);

		// Files are processed one at a time, each on its own isolated pipeline
		// task; cases drop into the queue as they finish.
		const live: RunLine[] = [];
		try {
			const { failed } = await api.submitInvoices(files, (p) => {
				if (p.phase === 'start') {
					setProgress(`Processing ${p.index + 1} of ${p.total} — ${p.name} (~2–3 min)`);
					return;
				}
				if (p.phase === 'done' && p.record) {
					store.addCases([p.record]);
					live.push({ name: p.name, ok: true, detail: p.detail ?? '' });
					const c = p.record.case;
					toast.push({
						variant: QUEUE_TOAST[c.queue_status] ?? 'info',
						title: `New case: ${c.invoice.invoice_number || p.name}`,
						body: `${c.queue_status.replace(/_/g, ' ')} · ${c.risk.risk_level} risk`,
					});
				} else {
					live.push({ name: p.name, ok: false, detail: p.detail ?? 'failed' });
					toast.push({ variant: 'error', title: `Couldn't process ${p.name}`, body: p.detail });
				}
				setLines([...live]);
			});
			setProgress(null);
			if (failed.length && failed.length === files.length) {
				setError('Every file failed — check the pipeline connection and try again.');
			}
		} catch (e) {
			setProgress(null);
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	const added = lines.filter((l) => l.ok).length;

	// Same bucketing QueueView uses for its metrics — always rendered, zeros
	// included, so the panel matches the Approval queue even on an empty store.
	const activity = useMemo(() => {
		const acc = { total: store.cases.length, cleared: 0, flagged: 0, hold: 0 };
		for (const rec of store.cases) {
			const b = queueBucket(rec);
			if (b === 'cleared') acc.cleared++;
			else if (b === 'review') acc.flagged++;
			else if (b === 'hold') acc.hold++;
		}
		return acc;
	}, [store.cases]);

	return (
		<div style={styles.page}>
			<ContentHeader
				title="Submit invoices"
				subtitle="Drop supplier invoice files to run fraud triage. Each file is processed on its own isolated pipeline run."
				actions={<Button variant="secondary" onClick={onDone}>Back to queue</Button>}
			/>

			{!api.ready && <Banner variant="warning">Connecting to the fraud pipeline…</Banner>}
			{error && <Banner variant="error">{error}</Banner>}

			<div style={styles.centerArea}>
				<div style={styles.stack}>
					<div style={styles.row}>
						<div style={styles.colMain}>
					<Card header="Upload">
						<PipelineSteps />

						<div
							style={dragging ? { ...styles.dropWrap, ...styles.dropWrapActive } : styles.dropWrap}
							onDragEnter={(e) => {
								e.preventDefault();
								setDragging(true);
							}}
							onDragOver={(e) => {
								e.preventDefault();
								if (!dragging) setDragging(true);
							}}
							onDragLeave={(e) => {
								if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
							}}
							onDrop={() => setDragging(false)}
						>
							<BxCloudUpload size={34} color="var(--rr-text-secondary)" />
							<DropZone
								title={busy ? progress ?? 'Processing…' : 'Drop invoice files here'}
								hint="PDF, TXT, or image. Files run sequentially — allow ~2–3 minutes each."
								onFiles={(files) => {
									if (!busy && api.ready) void handleFiles(files);
								}}
							/>
						</div>

						<div style={styles.callout}>
							<span style={{ flex: '0 0 auto', color: 'var(--rr-color-info, #2563eb)', marginTop: 1 }}>
								<BxShow size={16} />
							</span>
							<span>
								Each invoice is checked against vendor history, bank-account changes, and amount
								anomalies in real time.
							</span>
						</div>

						<div style={styles.note}>
							{busy
								? 'Each invoice: extraction, vendor lookup, deterministic rules, then risk assessment — on a fresh task so results never cross-contaminate.'
								: 'Files are sent one at a time to webhook_invoice; each result lands in the approval queue as it completes.'}
						</div>
					</Card>
						</div>

						<div style={styles.colAside}>
							<Card header="Today's activity">
								<MiniContainer columns={2}>
									<MetricCard value={activity.total} label="Processed" />
									<MetricCard value={activity.cleared} label="Auto-cleared" accent={QUEUE_ACCENT.cleared} />
									<MetricCard value={activity.flagged} label="Flagged" accent={QUEUE_ACCENT.review} />
									<MetricCard value={activity.hold} label="Auto-hold" accent={QUEUE_ACCENT.hold} />
								</MiniContainer>
							</Card>
						</div>
					</div>

					{lines.length > 0 && (
						<Card
							header={`${busy ? 'Processing' : 'Last run'} — ${added} of ${lines.length} added to queue`}
							headerActions={added > 0 ? <Button small onClick={onDone}>View queue</Button> : undefined}
						>
							<div style={styles.lines}>
								{lines.map((l, i) => (
									<div key={`${l.name}-${i}`} style={styles.line}>
										<StatusBadge variant={l.ok ? 'success' : 'error'}>{l.ok ? 'queued' : 'failed'}</StatusBadge>
										<span>{l.name}</span>
										<span style={styles.note}>— {l.detail}</span>
									</div>
								))}
								{busy && progress && <div style={styles.note}>{progress}</div>}
							</div>
						</Card>
					)}
				</div>
			</div>
		</div>
	);
};

export default SubmitView;
