// =============================================================================
// SubmitPanel — file input / dropzone for invoice submission.
//
// The input surface (click, drag, drop, staging) is ALWAYS interactive — it is
// never gated on pipeline readiness. Only an in-flight batch (`phase ===
// 'running'`) pauses new drops. If the pipeline is offline, files still stage
// and "Confirm submit" still fires; the call then fails gracefully with a
// friendly inline error.
//
// COST-GATED: picking files only STAGES them. The real pipeline call fires
// exclusively from the explicit "Confirm submit" click — never on mount, drop,
// selection, or hot-reload. The session spend estimate is bumped only when a
// real run is plausible (pipeline reported ready).
// =============================================================================

import React, { useCallback, useRef, useState } from 'react';
import type { SubmitProgress } from '../lib/pipeline';
import type { CaseRecord } from '../lib/types';
import { COST } from './costEstimates';
import { friendlyError } from '../lib/friendlyError';
import { AlertTriangle, FileText, X } from './icons';

type Phase = 'idle' | 'staged' | 'running';

export interface SubmitPanelProps {
	/** whether the pipeline reported ready — used ONLY to guard the cost estimate
	 *  and to show a non-blocking note. It never disables the input surface. */
	ready: boolean;
	/** short reason the pipeline isn't ready (e.g. "still connecting") — shown as
	 *  an advisory note; the dropzone stays fully usable regardless. */
	notReadyReason?: string;
	submitInvoices: (
		files: File[],
		onProgress?: (p: SubmitProgress) => void,
	) => Promise<{ ok: CaseRecord[]; failed: { name: string; reason: string }[] }>;
	/** called once per case as it lands (streamed), so the queue fills incrementally */
	onCase: (rec: CaseRecord) => void;
	/** bump the session cost estimate — called when a confirmed call actually fires */
	onSpend: (amount: number) => void;
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const SubmitPanel: React.FC<SubmitPanelProps> = ({
	ready,
	notReadyReason,
	submitInvoices,
	onCase,
	onSpend,
}) => {
	const [phase, setPhase] = useState<Phase>('idle');
	const [files, setFiles] = useState<File[]>([]);
	const [dragOver, setDragOver] = useState(false);
	const [progress, setProgress] = useState<{ i: number; total: number; name: string } | null>(null);
	const [failures, setFailures] = useState<{ name: string; reason: string }[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);

	const running = phase === 'running';
	const canPick = phase === 'idle' && !running;

	const stage = useCallback((list: FileList | null) => {
		const arr = list ? Array.from(list) : [];
		if (!arr.length) return;
		setFiles(arr);
		setFailures([]);
		setPhase('staged');
	}, []);

	const openPicker = useCallback(() => inputRef.current?.click(), []);

	const cancel = useCallback(() => {
		setFiles([]);
		setPhase('idle');
		if (inputRef.current) inputRef.current.value = '';
	}, []);

	const confirmSubmit = useCallback(async () => {
		if (!files.length) return;
		setPhase('running');
		setProgress(null);
		// Only count spend when a real run is plausible — a submit made while the
		// pipeline is offline fails instantly at ~$0 and shouldn't inflate the tally.
		if (ready) onSpend(files.length * COST.submitPerInvoiceEst);
		try {
			const { failed } = await submitInvoices(files, (p) => {
				if (p.phase === 'start') setProgress({ i: p.index, total: p.total, name: p.name });
				else if (p.phase === 'done' && p.record) onCase(p.record);
			});
			setFailures(failed);
		} catch (e) {
			setFailures([{ name: 'submission', reason: msg(e) }]);
		} finally {
			setFiles([]);
			setProgress(null);
			setPhase('idle');
			if (inputRef.current) inputRef.current.value = '';
		}
	}, [files, ready, submitInvoices, onCase, onSpend]);

	return (
		<div
			onClick={canPick ? openPicker : undefined}
			onKeyDown={
				canPick
					? (e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								openPicker();
							}
					  }
					: undefined
			}
			role={canPick ? 'button' : undefined}
			tabIndex={canPick ? 0 : undefined}
			aria-label={canPick ? 'Add invoice files' : undefined}
			onDragOver={(e) => {
				if (running) return;
				e.preventDefault();
				setDragOver(true);
			}}
			onDragLeave={() => setDragOver(false)}
			onDrop={(e) => {
				e.preventDefault();
				setDragOver(false);
				if (!running) stage(e.dataTransfer.files);
			}}
			className={`rounded-card border bg-surface px-4 py-3 ${canPick ? 'cursor-pointer hover:border-ink-faint' : ''}`}
			style={{
				borderColor: dragOver ? '#9AA7B8' : '#334155',
				borderStyle: phase === 'idle' ? 'dashed' : 'solid',
			}}
		>
			<input ref={inputRef} type="file" multiple hidden onChange={(e) => stage(e.target.files)} />

			{phase === 'idle' && (
				<div className="flex flex-wrap items-center gap-3">
					<span className="grid h-8 w-8 place-items-center rounded-md bg-surface-2 text-ink-dim">
						<FileText size={16} />
					</span>
					<div className="min-w-0 flex-1">
						<p className="text-[12.5px] font-semibold text-ink">
							Drop invoice files here, or{' '}
							<span className="underline decoration-ink-faint underline-offset-2">browse</span>
						</p>
						<p className="mt-0.5 text-[11px] text-ink-faint">
							Each file runs extraction → vendor lookup → deterministic rules → risk scoring, then lands in the queue
							— typically 1–2 minutes per file.
						</p>
						{notReadyReason && (
							<p className="mt-1 flex items-center gap-1 text-[11px] font-medium" style={{ color: '#F5B942' }}>
								<AlertTriangle size={11} className="shrink-0" />
								Pipeline not connected ({notReadyReason}). You can still queue files — submitting will attempt to
								connect and report any error here.
							</p>
						)}
					</div>
				</div>
			)}

			{phase === 'staged' && (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
					<span className="grid h-8 w-8 place-items-center rounded-md bg-surface-2 text-ink-dim">
						<FileText size={16} />
					</span>
					<div className="min-w-0 flex-1">
						<p className="truncate text-[12.5px] font-semibold text-ink">
							{files.length} file{files.length === 1 ? '' : 's'} ready
							<span className="ml-1 font-normal text-ink-dim">· {files.map((f) => f.name).join(', ')}</span>
						</p>
						{notReadyReason && (
							<p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium" style={{ color: '#F5B942' }}>
								<AlertTriangle size={11} className="shrink-0" />
								Pipeline not connected ({notReadyReason}) — submitting now will likely fail; the error will show
								below.
							</p>
						)}
					</div>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							void confirmSubmit();
						}}
						disabled={running}
						className="pfs-press inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-surface px-3 py-1.5 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
						style={{ borderColor: '#F59E0B', color: '#F59E0B' }}
					>
						Confirm submit
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							cancel();
						}}
						className="cursor-pointer text-[12px] font-medium text-ink-dim hover:text-ink"
					>
						Cancel
					</button>
				</div>
			)}

			{phase === 'running' && (
				<div>
					<p className="text-[12.5px] font-semibold text-ink">
						{progress ? `Processing ${progress.i + 1} of ${progress.total} — ${progress.name}` : 'Starting…'}
					</p>
					<div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-2">
						{/* Indeterminate: a single-file run is a long opaque wait, not a fillable
						   fraction — so the bar moves rather than sitting frozen at 0%. */}
						<div className="pfs-bar-indeterminate h-full rounded-full bg-ink-dim" />
					</div>
					<p className="mt-1.5 text-[11px] text-ink-faint">
						Extraction, vendor lookup, deterministic rules and risk scoring run per file — typically 1–2 minutes
						each. Leave this tab open.
					</p>
				</div>
			)}

			{failures.length > 0 && phase === 'idle' && (
				<ul className="mt-2 space-y-0.5">
					{failures.map((f, i) => (
						<li key={i} className="flex items-start gap-1.5 text-[11px]" style={{ color: '#F87171' }}>
							<X size={11} className="mt-0.5 shrink-0" />
							<span>
								<span className="font-medium">{f.name}</span> — {friendlyError(f.reason).friendly}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
};
