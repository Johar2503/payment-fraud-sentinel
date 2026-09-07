// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * Investigation Timeline — a vertical stepper that replays the fraud-triage
 * sequence the pipeline actually ran, from data already on the case record.
 * No new data, no pipeline calls: it reframes vendor lookup / deterministic
 * rules / risk assessment / verification as an investigation, not a table.
 */

import React from 'react';
import { BxCheck, BxPlus, BxRefresh } from 'shell';
import { ACCENT, FX } from './fx';
import type { CaseRecord, RiskLevel } from '../lib/types';

type IconComp = React.FC<{ size?: number; color?: string; style?: React.CSSProperties }>;
type Tone = 'ok' | 'alert' | 'pending' | 'neutral';

const TONE_COLOR: Record<Tone, string> = {
	ok: '#16a34a',
	alert: '#dc2626',
	pending: ACCENT.amber,
	neutral: 'var(--rr-text-secondary)',
};

const RISK_HEX: Record<RiskLevel, string> = {
	low: '#16a34a',
	medium: ACCENT.amber,
	high: ACCENT.amber,
	critical: '#dc2626',
};

/** X mark — the shell has no BxX, so a 45°-rotated plus reads cleanly. */
const IconX: IconComp = ({ size = 14, color, style }) => (
	<BxPlus size={size} color={color} style={{ ...style, transform: 'rotate(45deg)' }} />
);

function toneIcon(tone: Tone): IconComp {
	if (tone === 'alert') return IconX;
	if (tone === 'pending') return BxRefresh;
	return BxCheck; // ok + neutral
}

interface Step {
	key: string;
	label: string;
	tone: Tone;
	/** Overrides the bubble colour (used to tie Risk Assessment to the header). */
	color?: string;
	liveTag?: string;
	lines: React.ReactNode;
}

const subLine: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };

/** a/b/c pass-fail row inside the Deterministic Rules step. */
const RuleRow: React.FC<{ label: string; fired: boolean }> = ({ label, fired }) => {
	const Icon = fired ? IconX : BxCheck;
	const color = fired ? TONE_COLOR.alert : TONE_COLOR.ok;
	return (
		<span style={subLine}>
			<Icon size={13} color={color} />
			<span style={{ color: fired ? 'var(--rr-text-primary)' : 'var(--rr-text-secondary)' }}>{label}</span>
		</span>
	);
};

export const InvestigationTimeline: React.FC<{ rec: CaseRecord }> = ({ rec }) => {
	const c = rec.case;
	const vr = rec.verificationResult;

	// Deterministic HOLD conditions (prompt_case step 2): a = payee bank not on
	// file, b = amount > 2x vendor mean, c = vendor younger than 30 days.
	const fired = c.rules_fired.map((r) => r.toLowerCase());
	const firedA = fired.some((r) => /bank|account|remit/.test(r)) || c.vendor.bank_account_known === false;
	const firedB =
		fired.some((r) => /2x|over.?2|outlier|amount_over/.test(r)) || c.vendor.amount_over_2x_mean === true;
	const firedC =
		fired.some((r) => /first.?seen|30.?day|within_30|new.?vendor/.test(r)) ||
		(c.vendor.days_since_first_seen != null && c.vendor.days_since_first_seen < 30);

	const riskAlert = c.risk.risk_level === 'high' || c.risk.risk_level === 'critical';

	const steps: Step[] = [
		{
			key: 'vendor',
			label: 'Vendor lookup',
			tone: c.vendor.found ? 'ok' : 'alert',
			liveTag: 'Live database query',
			lines: (
				<>
					<span>{c.vendor.found ? `Found · ${c.vendor.vendor_id ?? 'match'}` : 'Not on file'}</span>
					<span>
						{c.vendor.days_since_first_seen != null ? `${c.vendor.days_since_first_seen} days as vendor` : 'Age unknown'}
						{c.vendor.mean_amount != null
							? ` · mean ${c.vendor.mean_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
							: ''}
					</span>
				</>
			),
		},
		{
			key: 'rules',
			label: 'Deterministic rules',
			tone: c.deterministic_hold ? 'alert' : 'ok',
			liveTag: 'Automated rule execution',
			lines: (
				<>
					<RuleRow label="Payee bank account on file" fired={firedA} />
					<RuleRow label="Amount within 2× vendor mean" fired={firedB} />
					<RuleRow label="Vendor at least 30 days old" fired={firedC} />
					<span style={{ marginTop: 2, fontWeight: 700, color: c.deterministic_hold ? TONE_COLOR.alert : 'var(--rr-text-secondary)' }}>
						{c.deterministic_hold ? 'HOLD — all three conditions met' : 'No deterministic hold'}
					</span>
				</>
			),
		},
		{
			key: 'risk',
			label: 'Risk assessment',
			tone: riskAlert ? 'alert' : c.risk.risk_level === 'medium' ? 'neutral' : 'ok',
			color: RISK_HEX[c.risk.risk_level],
			lines: (
				<>
					<span style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, color: RISK_HEX[c.risk.risk_level] }}>
						{c.risk.risk_level} · {c.risk.risk_score}/100
					</span>
					<span>{c.risk.flags.length} evidence flag{c.risk.flags.length === 1 ? '' : 's'}</span>
				</>
			),
		},
		{
			key: 'verify',
			label: 'Verification',
			tone: vr ? (vr.verification === 'confirmed' ? 'ok' : 'alert') : c.verification.status === 'pending' ? 'pending' : 'neutral',
			lines: vr ? (
				<span style={{ fontWeight: 600, color: vr.verification === 'confirmed' ? TONE_COLOR.ok : TONE_COLOR.alert }}>
					{vr.verification === 'confirmed' ? 'Vendor confirmed' : 'Vendor response suspicious'}
				</span>
			) : c.verification.status === 'pending' ? (
				<span>Awaiting out-of-band vendor check</span>
			) : (
				<span>Not required — auto-cleared</span>
			),
		},
	];

	return (
		<div style={{ position: 'relative' }}>
			{steps.map((s, i) => {
				const last = i === steps.length - 1;
				const Icon = toneIcon(s.tone);
				const bubble = s.color ?? TONE_COLOR[s.tone];
				return (
					<div
						key={s.key}
						className={FX.fadeUp}
						style={{ position: 'relative', paddingLeft: 34, paddingBottom: last ? 0 : 18, animationDelay: `${i * 90}ms` }}
					>
						{!last && (
							<span style={{ position: 'absolute', left: 11, top: 26, bottom: 0, width: 2, background: 'var(--rr-border, rgba(0,0,0,0.12))' }} />
						)}
						<span
							style={{
								position: 'absolute',
								left: 0,
								top: 1,
								width: 24,
								height: 24,
								borderRadius: '50%',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								color: '#fff',
								background: bubble,
							}}
						>
							<Icon size={14} color="#fff" />
						</span>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 24, flexWrap: 'wrap' }}>
							<span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--rr-text-primary)' }}>
								{s.label}
							</span>
							{s.liveTag && <span className="pfs-ai-pill">{s.liveTag}</span>}
						</div>
						<div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, color: 'var(--rr-text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
							{s.lines}
						</div>
					</div>
				);
			})}
		</div>
	);
};
