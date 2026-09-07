// =============================================================================
// Small shared UI atoms + the risk/status colour maps. Palette-locked:
//   amber  -> risk / warning        violet -> AI-generated content
//   danger -> critical / do-not-pay  slate  -> neutral / cleared
// =============================================================================

import React from 'react';
import type { QueueStatus, RiskLevel } from '../lib/types';
import { Check, Dot, X } from './icons';

// --- risk tiers -------------------------------------------------------------
export interface TierMeta {
	label: string;
	/** readable text colour on ground/surface */
	fg: string;
	/** solid bar / segment colour */
	bar: string;
	/** low-alpha wash for banners */
	tint: string;
	/** left-border / rule colour */
	edge: string;
	rank: number;
}

export const TIER: Record<RiskLevel, TierMeta> = {
	// Four visually distinct steps within the palette: slate → gold → amber → red.
	// medium (soft gold) and high (saturated amber) must not read as the same.
	low: { label: 'Low', fg: '#CBD5E1', bar: '#64748B', tint: 'rgba(100,116,139,0.12)', edge: '#475569', rank: 0 },
	medium: { label: 'Medium', fg: '#F5B942', bar: '#D9962A', tint: 'rgba(245,158,11,0.10)', edge: '#B4770D', rank: 1 },
	high: { label: 'High', fg: '#F59E0B', bar: '#F59E0B', tint: 'rgba(245,158,11,0.18)', edge: '#F59E0B', rank: 2 },
	critical: { label: 'Critical', fg: '#F87171', bar: '#EF4444', tint: 'rgba(239,68,68,0.14)', edge: '#EF4444', rank: 3 },
};

// --- queue status --------------------------------------------------------------
export interface StatusMeta {
	label: string;
	fg: string;
	tint: string;
}
export const STATUS: Record<QueueStatus, StatusMeta> = {
	auto_hold: { label: 'Auto-hold', fg: '#F87171', tint: 'rgba(239,68,68,0.12)' },
	pending_review: { label: 'Pending review', fg: '#F5B942', tint: 'rgba(245,158,11,0.12)' },
	auto_cleared: { label: 'Auto-cleared', fg: '#9AA7B8', tint: 'rgba(154,167,184,0.12)' },
};

// --- atoms -------------------------------------------------------------------

export const Chip: React.FC<{
	children: React.ReactNode;
	fg?: string;
	tint?: string;
	className?: string;
	mono?: boolean;
}> = ({ children, fg = '#9AA7B8', tint = 'rgba(154,167,184,0.12)', className = '', mono }) => (
	<span
		className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
			mono ? 'font-mono lowercase tracking-normal' : ''
		} ${className}`}
		style={{ color: fg, background: tint }}
	>
		{children}
	</span>
);

export const SectionLabel: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
	<div className="mb-2 flex items-baseline justify-between">
		<h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">{children}</h3>
		{right}
	</div>
);

export const Panel: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({
	children,
	className = '',
	style,
}) => (
	<section className={`rounded-card border border-line bg-surface ${className}`} style={style}>
		{children}
	</section>
);

export const KeyVal: React.FC<{ k: string; v: React.ReactNode; mono?: boolean }> = ({ k, v, mono }) => (
	<div className="flex items-start justify-between gap-4 py-1.5 text-[13px]">
		<span className="shrink-0 text-ink-dim">{k}</span>
		<span className={`text-right text-ink ${mono ? 'font-mono' : ''}`}>{v}</span>
	</div>
);

/** pass/fail marker used by the deterministic-rules stage */
export const PassFail: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
	<div className="flex items-center gap-2 text-[13px]">
		<span
			className="grid h-4 w-4 place-items-center rounded-full"
			style={{
				color: ok ? '#F87171' : '#9AA7B8',
				background: ok ? 'rgba(239,68,68,0.14)' : 'rgba(154,167,184,0.12)',
			}}
		>
			{ok ? <Check size={11} strokeWidth={2.5} /> : <X size={11} strokeWidth={2.5} />}
		</span>
		<span className={ok ? 'text-ink' : 'text-ink-dim'}>{label}</span>
		<span className="ml-auto text-[11px] uppercase tracking-wide text-ink-faint">{ok ? 'fired' : 'not fired'}</span>
	</div>
);

export const money = (n: number | string | null | undefined, currency = 'USD'): string => {
	const num = typeof n === 'string' ? Number(n) : n;
	if (num == null || Number.isNaN(num)) return '—';
	try {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(num);
	} catch {
		return `$${num.toLocaleString('en-US')}`;
	}
};

/**
 * Stepper node marker. `ok` / `flag` are genuine pass/fail (check / ✕). `idle`
 * is "not run yet". `score` is NOT a pass/fail — it's a risk *reading*, drawn as
 * a filled gauge dot in the risk tier's colour (`tone`), so a scored stage never
 * reads as "this stage errored".
 */
export const StageMark: React.FC<{ state: 'ok' | 'flag' | 'idle' | 'score'; tone?: RiskLevel }> = ({ state, tone }) => {
	const t = TIER[tone ?? 'low'];
	const map = {
		ok: { c: '#9AA7B8', b: 'rgba(154,167,184,0.14)', node: <Check size={12} strokeWidth={2.5} /> },
		flag: { c: '#F87171', b: 'rgba(239,68,68,0.16)', node: <X size={12} strokeWidth={2.5} /> },
		idle: { c: '#64748B', b: 'rgba(100,116,139,0.14)', node: <Dot size={12} /> },
		score: {
			c: t.bar,
			b: t.tint,
			node: (
				<span className="grid h-3 w-3 place-items-center rounded-full border-2" style={{ borderColor: 'currentColor' }}>
					<span className="h-1 w-1 rounded-full" style={{ background: 'currentColor' }} />
				</span>
			),
		},
	}[state];
	return (
		<span
			className="relative z-10 grid h-6 w-6 place-items-center rounded-full ring-4 ring-ground"
			style={{ color: map.c, background: map.b }}
		>
			{map.node}
		</span>
	);
};
