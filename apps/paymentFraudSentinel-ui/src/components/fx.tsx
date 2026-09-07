// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * Demo-polish motion + a light-theme design-system overlay. One injected
 * <style> block — no CSS library, no build config change — mounted once at the
 * app root. Everything degrades to no motion under `prefers-reduced-motion`.
 *
 * The overlay is deliberately narrow: an IBM Plex Sans typography pass and two
 * accent colours layered over the RocketRide shell's light theme. Background /
 * card / text colours stay on the shell tokens — this is not a re-theme.
 */

import React from 'react';

export const FX = {
	fadeUp: 'pfs-fade-up',
	toastIn: 'pfs-toast-in',
	pop: 'pfs-pop',
	glowSuccess: 'pfs-glow-success',
	glowError: 'pfs-glow-error',
} as const;

/**
 * Accent colours from the recommended design system, layered over the shell's
 * light theme:
 *   amber  — refines the warning / pending-review accents this app owns
 *            (MetricCard stripe, risk meter/border for medium+high).
 *   violet — signature for AI-powered surfaces (the case chat assistant),
 *            kept visually distinct from the risk-level colour coding.
 */
export const ACCENT = {
	amber: '#F59E0B',
	violet: '#8B5CF6',
} as const;

const FONT_STACK =
	"'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap');

/* Typography overlay — theme-agnostic. The .pfs-app wrapper is display:contents
   (no box), so this changes the font only, never the layout. Form controls need
   it named explicitly because they don't inherit font-family. */
.pfs-app,
.pfs-app input,
.pfs-app select,
.pfs-app textarea,
.pfs-app button { font-family: ${FONT_STACK}; }

@keyframes pfs-fade-up-kf { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes pfs-toast-in-kf { from { opacity: 0; transform: translateX(18px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes pfs-pop-kf { 0% { opacity: 0; transform: scale(0.5); } 60% { opacity: 1; transform: scale(1.12); } 100% { opacity: 1; transform: scale(1); } }
@keyframes pfs-glow-success-kf { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,0.0); } 30% { box-shadow: 0 0 0 4px rgba(22,163,74,0.35); } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0.0); } }
@keyframes pfs-glow-error-kf { 0% { box-shadow: 0 0 0 0 rgba(220,38,38,0.0); } 30% { box-shadow: 0 0 0 4px rgba(220,38,38,0.35); } 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.0); } }

.pfs-fade-up { animation: pfs-fade-up-kf 0.34s ease both; }
.pfs-toast-in { animation: pfs-toast-in-kf 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.pfs-pop { animation: pfs-pop-kf 0.42s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.pfs-glow-success { animation: pfs-glow-success-kf 1.1s ease both; border-radius: 8px; }
.pfs-glow-error { animation: pfs-glow-error-kf 1.1s ease both; border-radius: 8px; }

/* Risk-score meter (grid cell) — width transitions in from 0 on render. */
.pfs-meter { width: 76px; height: 8px; border-radius: 999px; background: var(--rr-bg-secondary, rgba(0,0,0,0.08)); overflow: hidden; display: inline-block; vertical-align: middle; }
.pfs-meter > i { display: block; height: 100%; width: 0; border-radius: 999px; transition: width 0.7s cubic-bezier(0.2, 0.8, 0.2, 1); }
.pfs-meter-num { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--rr-text-secondary); margin-left: 8px; vertical-align: middle; }

/* Approval-queue rows read as clickable before you click them. */
.pfs-grid .tabulator-row { cursor: pointer; transition: background-color 0.12s ease; }
.pfs-grid .tabulator-row:hover { background-color: var(--rr-bg-secondary, rgba(0,0,0,0.05)) !important; }

/* Keyboard focus — visible and deliberate (checklist). */
.pfs-focus:focus-visible { outline: 2px solid ${ACCENT.amber}; outline-offset: 2px; border-radius: 6px; }
.pfs-focus-ai:focus-visible { outline: 2px solid ${ACCENT.violet}; outline-offset: 2px; border-radius: 6px; }

/* AI assistant surface — violet signature, distinct from risk colours. */
.pfs-ai-rail { border-left: 2px solid ${ACCENT.violet}; padding-left: 12px; }
.pfs-ai-pill { display: inline-flex; align-items: center; flex: none; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; padding: 2px 8px; border-radius: 999px; color: ${ACCENT.violet}; background: rgba(139, 92, 246, 0.12); white-space: nowrap; }

@media (prefers-reduced-motion: reduce) {
	.pfs-fade-up, .pfs-toast-in, .pfs-pop, .pfs-glow-success, .pfs-glow-error { animation: none !important; }
	.pfs-meter > i, .pfs-grid .tabulator-row { transition: none !important; }
}
`;

/** Mount once near the app root. */
export const FxStyles: React.FC = () => <style>{CSS}</style>;
