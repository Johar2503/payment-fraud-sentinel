// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

import React, { useState } from 'react';
import {
	Banner,
	Button,
	BxCheck,
	BxChevronDown,
	BxChevronRight,
	BxFile,
	BxGridAlt,
	BxHand,
	BxLock,
	BxNote,
	BxSearch,
	BxSortAlt,
	BxUser,
	ConfirmDialog,
	DetailPanel,
	InputField,
	LabelValue,
	Section,
	StatusBadge,
} from 'shell';
import { ACCENT, FX } from './fx';
import { InvestigationTimeline } from './InvestigationTimeline';
import type { CaseStore } from '../lib/cases';
import type { PipelineApi } from '../lib/pipeline';
import type { CaseRecord, ChatMessage, Decision, QueueStatus, RiskLevel } from '../lib/types';

const QUEUE_VARIANT: Record<QueueStatus, 'success' | 'warning' | 'error'> = {
	auto_cleared: 'success',
	pending_review: 'warning',
	auto_hold: 'error',
};

/** Case-header colours — hardcoded (no CSS-var dependency) so the tint is
 * predictable. Matches the design-system risk palette: green / amber / red. */
const RISK_HEX: Record<RiskLevel, string> = {
	low: '#16a34a',
	medium: ACCENT.amber,
	high: ACCENT.amber,
	critical: '#dc2626',
};
const RISK_TINT: Record<RiskLevel, string> = {
	low: 'rgba(22, 163, 74, 0.10)',
	medium: 'rgba(245, 158, 11, 0.12)',
	high: 'rgba(245, 158, 11, 0.12)',
	critical: 'rgba(220, 38, 38, 0.10)',
};

type IconComp = React.FC<{ size?: number; color?: string; style?: React.CSSProperties }>;

/** Pick a shell Bx* icon that fits a risk-flag type. */
function flagIcon(type: string): IconComp {
	const t = type.toLowerCase();
	if (/bank|account|remit|iban|routing/.test(t)) return BxLock;
	if (/amount|outlier|round|sum|threshold|2x|total|value/.test(t)) return BxSortAlt;
	if (/vendor|supplier|payee|new_|first_seen/.test(t)) return BxUser;
	if (/urgen|same.?day|wire|rush|immediate|pressure|deadline/.test(t)) return BxHand;
	if (/po|purchase|order/.test(t)) return BxNote;
	if (/tax|vat|math|calc/.test(t)) return BxGridAlt;
	if (/doc|parse|unprocess|file|ocr|read|attach/.test(t)) return BxFile;
	if (/date|due/.test(t)) return BxNote;
	return BxSearch;
}

const money = (amount: string, currency: string) => {
	const n = Number(amount);
	return Number.isFinite(n) ? `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `${currency} ${amount}`;
};

const styles: Record<string, React.CSSProperties> = {
	evidenceList: { display: 'flex', flexDirection: 'column', gap: 8 },
	evidenceCard: {
		display: 'flex',
		gap: 10,
		alignItems: 'flex-start',
		padding: '10px 12px',
		borderRadius: 8,
		background: 'var(--rr-bg-secondary, rgba(0,0,0,0.03))',
		border: '1px solid var(--rr-border, rgba(0,0,0,0.08))',
		borderLeft: '3px solid var(--rr-color-error, #dc2626)',
	},
	evidenceIcon: { color: 'var(--rr-color-error, #dc2626)', display: 'flex', flex: 'none', paddingTop: 1 },
	evidenceType: { fontSize: 12, fontWeight: 700, color: 'var(--rr-text-primary)', textTransform: 'capitalize' },
	evidenceText: { fontSize: 12, color: 'var(--rr-text-secondary)', marginTop: 2, lineHeight: 1.5 },
	caseHeader: { borderRadius: 10, padding: '14px 16px', marginBottom: 4 },
	caseRiskRow: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
	caseRiskWord: { fontSize: 20, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' },
	caseRiskScore: { fontSize: 13, color: 'var(--rr-text-secondary)', fontVariantNumeric: 'tabular-nums' },
	caseIdRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
	caseId: {
		fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
		fontSize: 12,
		fontWeight: 600,
		padding: '2px 8px',
		borderRadius: 6,
		background: 'var(--rr-bg-paper, #fff)',
		border: '1px solid var(--rr-border, rgba(0,0,0,0.15))',
		color: 'var(--rr-text-primary)',
	},
	caseVendor: { fontSize: 15, fontWeight: 700, color: 'var(--rr-text-primary)' },
	caseBadges: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' },
	summary: { fontSize: 13, lineHeight: 1.55, color: 'var(--rr-text-primary)' },
	noteLabel: { fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block', color: 'var(--rr-text-secondary)' },
	transcript: { fontSize: 12, lineHeight: 1.5 },
	chatHeader: {
		display: 'flex',
		alignItems: 'center',
		gap: 6,
		cursor: 'pointer',
		userSelect: 'none',
		marginTop: 20,
		paddingTop: 12,
		borderTop: '1px solid var(--rr-border)',
		fontSize: 11,
		fontWeight: 700,
		letterSpacing: '0.08em',
		textTransform: 'uppercase',
		color: ACCENT.violet,
	},
	chatBody: { marginTop: 10 },
	chatList: {
		display: 'flex',
		flexDirection: 'column',
		gap: 10,
		marginTop: 10,
		maxHeight: 280,
		overflowY: 'auto',
		paddingRight: 4,
	},
	chatMsg: { display: 'flex', gap: 8, alignItems: 'flex-start' },
	chatText: { fontSize: 13, lineHeight: 1.55, color: 'var(--rr-text-primary)', whiteSpace: 'pre-wrap' },
	chatHint: { fontSize: 12, lineHeight: 1.5, color: 'var(--rr-text-secondary)', fontStyle: 'italic', marginTop: 10 },
	chatInputRow: { display: 'flex', gap: 8, marginTop: 12 },
};

interface Props {
	rec: CaseRecord | null;
	reviewer: string;
	api: PipelineApi;
	store: CaseStore;
	onClose: () => void;
}

const CaseDetail: React.FC<Props> = ({ rec, reviewer, api, store, onClose }) => {
	const [busy, setBusy] = useState<'verify' | 'decide' | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const [confirm, setConfirm] = useState<Decision | null>(null);
	const [note, setNote] = useState('');
	const [flash, setFlash] = useState<Decision | null>(null);
	// Expanded by default — the case-grounded assistant is a primary feature, not
	// a footnote; a collapsed disclosure hides it from most reviewers.
	const [chatOpen, setChatOpen] = useState(true);
	const [chatInput, setChatInput] = useState('');
	const [chatBusy, setChatBusy] = useState(false);
	const [chatErr, setChatErr] = useState<string | null>(null);

	if (!rec) return null;
	const c = rec.case;
	const vr = rec.verificationResult;
	const decided = rec.decision;
	const canVerify = !decided && c.verification.status === 'pending' && !vr;
	const chat: ChatMessage[] = rec.chat ?? [];

	const doAsk = async () => {
		const q = chatInput.trim();
		if (!q || chatBusy) return;
		const history = chat;
		store.appendChat(rec.id, [{ role: 'reviewer', text: q, at: new Date().toISOString() }]);
		setChatInput('');
		setChatErr(null);
		setChatBusy(true);
		try {
			const answer = await api.askAboutCase(rec, q, history);
			store.appendChat(rec.id, [{ role: 'assistant', text: answer, at: new Date().toISOString() }]);
		} catch (e) {
			setChatErr(e instanceof Error ? e.message : String(e));
		} finally {
			setChatBusy(false);
		}
	};

	const doVerify = async () => {
		setBusy('verify');
		setErr(null);
		try {
			const result = await api.runVerification(rec);
			store.attachVerification(rec.id, result);
		} catch (e) {
			setErr(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(null);
		}
	};

	const doDecide = async (decision: Decision) => {
		setBusy('decide');
		setErr(null);
		try {
			await api.sendDecision(rec, decision, reviewer, note.trim());
			store.recordDecision(rec.id, decision, reviewer, note.trim(), true);
			setConfirm(null);
			setNote('');
			setFlash(decision);
			window.setTimeout(() => setFlash(null), 1300);
		} catch (e) {
			// The decision was made even if the writeback failed — record it unacked.
			store.recordDecision(rec.id, decision, reviewer, note.trim(), false);
			setErr(`Decision recorded, but risk_history writeback failed: ${e instanceof Error ? e.message : String(e)}`);
			setConfirm(null);
		} finally {
			setBusy(null);
		}
	};

	return (
		<>
			<DetailPanel
				open
				onClose={onClose}
				busy={busy !== null}
				title={c.invoice.invoice_number || rec.sourceFile}
				subtitle={`${c.invoice.vendor_name} · ${money(c.invoice.amount, c.invoice.currency)}`}
				width={460}
				footer={
					decided ? (
						<span className={decided.decision === 'approve' ? FX.glowSuccess : FX.glowError} style={{ display: 'inline-block' }}>
							<StatusBadge variant={decided.decision === 'approve' ? 'success' : 'error'}>
								{decided.decision === 'approve' ? 'Approved' : 'Rejected'} by {decided.reviewer}
								{decided.acked ? '' : ' (writeback failed)'}
							</StatusBadge>
						</span>
					) : (
						<>
							{canVerify && (
								<Button variant="secondary" disabled={busy !== null} onClick={doVerify}>
									{busy === 'verify' ? 'Verifying…' : 'Run verification'}
								</Button>
							)}
							<Button variant="danger" disabled={busy !== null} onClick={() => setConfirm('reject')}>
								Reject
							</Button>
							<Button disabled={busy !== null} onClick={() => setConfirm('approve')}>
								Approve
							</Button>
						</>
					)
				}
			>
				{flash && (
					<div
						style={{
							position: 'fixed',
							inset: 0,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							zIndex: 10000,
							pointerEvents: 'none',
						}}
					>
						<div
							className={FX.pop}
							style={{
								width: 92,
								height: 92,
								borderRadius: '50%',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								color: '#fff',
								background:
									flash === 'approve'
										? 'var(--rr-color-success, #16a34a)'
										: 'var(--rr-color-error, #dc2626)',
								boxShadow: '0 12px 44px rgba(0,0,0,0.28)',
							}}
						>
							<BxCheck size={46} color="#fff" />
						</div>
					</div>
				)}

				{err && <Banner variant="error">{err}</Banner>}

				<div
					style={{
						...styles.caseHeader,
						background: RISK_TINT[c.risk.risk_level],
						borderLeft: `4px solid ${RISK_HEX[c.risk.risk_level]}`,
					}}
				>
					<div style={styles.caseRiskRow}>
						<span style={{ ...styles.caseRiskWord, color: RISK_HEX[c.risk.risk_level] }}>
							{c.risk.risk_level} risk
						</span>
						<span style={styles.caseRiskScore}>{c.risk.risk_score}/100</span>
					</div>
					<div style={styles.caseIdRow}>
						<span style={styles.caseId}>{c.invoice.invoice_number || rec.sourceFile}</span>
						<span style={styles.caseVendor}>{c.invoice.vendor_name || 'Unknown vendor'}</span>
					</div>
					<div style={styles.caseBadges}>
						<StatusBadge variant={QUEUE_VARIANT[c.queue_status]}>{c.queue_status.replace(/_/g, ' ')}</StatusBadge>
						{c.deterministic_hold && <StatusBadge variant="error">deterministic hold</StatusBadge>}
					</div>
				</div>

				<Section label="Investigation">
					<InvestigationTimeline rec={rec} />
				</Section>

				<Section label="Invoice">
					<LabelValue label="Number" mono>{c.invoice.invoice_number || '—'}</LabelValue>
					<LabelValue label="Vendor">{c.invoice.vendor_name}</LabelValue>
					<LabelValue label="Amount">{money(c.invoice.amount, c.invoice.currency)}</LabelValue>
					<LabelValue label="Source file">{rec.sourceFile}</LabelValue>
					<LabelValue label="Received">{new Date(rec.receivedAt).toLocaleString()}</LabelValue>
				</Section>

				<Section label="Vendor master">
					<LabelValue label="Found">
						<StatusBadge variant={c.vendor.found ? 'success' : 'warning'}>
							{c.vendor.found ? (c.vendor.vendor_id ?? 'yes') : 'not on file'}
						</StatusBadge>
					</LabelValue>
					<LabelValue label="Bank account">
						<StatusBadge variant={c.vendor.bank_account_known ? 'success' : 'error'}>
							{c.vendor.bank_account_known ? 'known' : 'NOT on file'}
						</StatusBadge>
					</LabelValue>
					<LabelValue label="Mean invoice">
						{c.vendor.mean_amount != null ? c.vendor.mean_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
					</LabelValue>
					<LabelValue label="Days as vendor">{c.vendor.days_since_first_seen ?? '—'}</LabelValue>
				</Section>

				{c.amount_analysis && (
					<Section label="Amount analysis">
						<LabelValue label="Invoice amount">
							{c.amount_analysis.invoice_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
						</LabelValue>
						<LabelValue label="Ratio vs mean">
							{c.amount_analysis.ratio_vs_mean != null ? `${c.amount_analysis.ratio_vs_mean.toFixed(2)}×` : '—'}
						</LabelValue>
						<LabelValue label="Over 2× mean">
							<StatusBadge variant={c.amount_analysis.over_2x_mean ? 'error' : 'success'}>
								{c.amount_analysis.over_2x_mean ? 'yes' : 'no'}
							</StatusBadge>
						</LabelValue>
					</Section>
				)}

				{c.risk.flags.length > 0 && (
					<Section label={`Evidence (${c.risk.flags.length})`}>
						<div style={styles.evidenceList}>
							{c.risk.flags.map((f, i) => {
								const Icon = flagIcon(f.type);
								return (
									<div
										key={`${f.type}-${i}`}
										className={FX.fadeUp}
										style={{ ...styles.evidenceCard, animationDelay: `${i * 70}ms` }}
									>
										<span style={styles.evidenceIcon}>
											<Icon size={18} />
										</span>
										<div>
											<div style={styles.evidenceType}>{f.type.replace(/_/g, ' ')}</div>
											<div style={styles.evidenceText}>{f.evidence}</div>
										</div>
									</div>
								);
							})}
						</div>
					</Section>
				)}

				<Section label="Summary">
					<div style={styles.summary}>{c.summary}</div>
				</Section>

				<div
					className="pfs-focus-ai"
					style={styles.chatHeader}
					onClick={() => setChatOpen((v) => !v)}
					role="button"
					tabIndex={0}
					aria-expanded={chatOpen}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							setChatOpen((v) => !v);
						}
					}}
				>
					{chatOpen ? <BxChevronDown size={16} /> : <BxChevronRight size={16} />}
					Ask about this case{chat.length > 0 ? ` (${chat.length})` : ''}
				</div>

				{chatOpen && (
					<div className="pfs-ai-rail" style={styles.chatBody}>
						{chat.length === 0 && !chatBusy && (
							<div style={styles.chatHint}>
								Ask anything grounded in this case — vendor history, why a flag fired, what the
								deterministic rule checked, the verification outcome.
							</div>
						)}

						{(chat.length > 0 || chatBusy) && (
							<div style={styles.chatList}>
								{chat.map((m, i) => (
									<div key={`${m.at}-${i}`} className={FX.fadeUp} style={styles.chatMsg}>
										{m.role === 'assistant' ? (
											<span className="pfs-ai-pill">Assistant</span>
										) : (
											<StatusBadge variant="muted">You</StatusBadge>
										)}
										<span style={styles.chatText}>{m.text}</span>
									</div>
								))}
								{chatBusy && (
									<div className={FX.fadeUp} style={styles.chatMsg}>
										<span className="pfs-ai-pill">Assistant</span>
										<span style={{ ...styles.chatText, color: 'var(--rr-text-secondary)' }}>Thinking…</span>
									</div>
								)}
							</div>
						)}

						{chatErr && (
							<div style={{ ...styles.chatHint, color: 'var(--rr-color-error, #dc2626)', fontStyle: 'normal' }}>
								{chatErr}
							</div>
						)}

						<div style={styles.chatInputRow}>
							<InputField
								style={{ flex: 1 }}
								value={chatInput}
								placeholder="Ask a question about this case…"
								disabled={chatBusy}
								onChange={(e) => setChatInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										void doAsk();
									}
								}}
							/>
							<Button small disabled={chatBusy || !chatInput.trim()} onClick={() => void doAsk()}>
								{chatBusy ? 'Asking…' : 'Ask'}
							</Button>
						</div>
					</div>
				)}

				<Section label="Verification">
					<LabelValue label="Status">
						<StatusBadge
							variant={
								vr
									? vr.verification === 'confirmed'
										? 'success'
										: 'error'
									: c.verification.status === 'pending'
										? 'warning'
										: 'muted'
							}
						>
							{vr ? vr.verification : c.verification.status.replace(/_/g, ' ')}
						</StatusBadge>
					</LabelValue>
					{vr && (
						<div style={styles.transcript}>
							{vr.notes && (
								<div
									className={FX.fadeUp}
									style={{ fontStyle: 'italic', color: 'var(--rr-text-secondary)', marginBottom: 8 }}
								>
									{vr.notes}
								</div>
							)}
							{vr.transcript.map((t, i) => (
								<div
									key={`${t.speaker}-${i}`}
									className={FX.fadeUp}
									style={{ display: 'flex', gap: 8, marginBottom: 6, animationDelay: `${(vr.notes ? 1 : 0) * 120 + i * 150}ms` }}
								>
									<StatusBadge variant={t.speaker === 'sentinel' ? 'info' : 'muted'}>
										{t.speaker === 'sentinel' ? 'Sentinel' : 'Vendor'}
									</StatusBadge>
									<span style={{ fontSize: 12, lineHeight: 1.5 }}>{t.text}</span>
								</div>
							))}
						</div>
					)}
				</Section>

				{decided && (
					<Section label="Decision">
						<LabelValue label="Outcome">{decided.decision}</LabelValue>
						<LabelValue label="Reviewer">{decided.reviewer}</LabelValue>
						<LabelValue label="When">{new Date(decided.decidedAt).toLocaleString()}</LabelValue>
						{decided.note && <LabelValue label="Note">{decided.note}</LabelValue>}
						<LabelValue label="Writeback">
							<StatusBadge variant={decided.acked ? 'success' : 'warning'}>
								{decided.acked ? 'applied to risk_history' : 'not applied'}
							</StatusBadge>
						</LabelValue>
					</Section>
				)}
			</DetailPanel>

			{confirm && (
				<ConfirmDialog
					title={confirm === 'approve' ? 'Approve this invoice for payment?' : 'Reject this invoice?'}
					destructive={confirm === 'reject'}
					confirmLabel={confirm === 'approve' ? 'Approve' : 'Reject'}
					message={
						<div>
							<div style={{ marginBottom: 10 }}>
								{c.invoice.invoice_number} · {c.invoice.vendor_name} · {money(c.invoice.amount, c.invoice.currency)}
								{'. '}
								The outcome is written to the vendor's risk_history.
							</div>
							<label style={styles.noteLabel}>Note (optional)</label>
							<InputField
								value={note}
								placeholder="Reason / reference"
								onChange={(e) => setNote(e.target.value)}
							/>
						</div>
					}
					onConfirm={() => doDecide(confirm)}
					onCancel={() => setConfirm(null)}
				/>
			)}
		</>
	);
};

export default CaseDetail;
