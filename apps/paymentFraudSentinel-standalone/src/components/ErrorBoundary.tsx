// =============================================================================
// ErrorBoundary — last line of defence so a render-time exception shows a
// branded, actionable message instead of a blank white screen. Class component
// (the only way to catch render errors); no dependencies.
// =============================================================================

import React from 'react';
import { AlertTriangle } from './icons';

interface State {
	error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: React.ErrorInfo): void {
		// Surface it in the console for debugging; there is no telemetry sink here.
		console.error('[Payment Fraud Sentinel] render error:', error, info.componentStack);
	}

	render(): React.ReactNode {
		const { error } = this.state;
		if (!error) return this.props.children;

		return (
			<div className="flex min-h-screen items-center justify-center bg-ground px-6 py-10">
				<div className="w-full max-w-md rounded-card border border-line bg-surface p-6 text-center">
					<span
						className="mx-auto grid h-11 w-11 place-items-center rounded-full"
						style={{ color: '#F87171', background: 'rgba(239,68,68,0.14)' }}
					>
						<AlertTriangle size={20} />
					</span>
					<h1 className="mt-3 text-[15px] font-semibold text-ink">Something went wrong</h1>
					<p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-dim">
						The interface hit an unexpected error and stopped rendering. Your queue data is stored locally and is
						safe — reloading usually clears it.
					</p>
					<pre className="pfs-scroll mt-3 max-h-32 overflow-auto rounded-md border border-line bg-surface-2 px-3 py-2 text-left font-mono text-[10.5px] leading-relaxed text-ink-faint">
						{error.message || String(error)}
					</pre>
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="pfs-press mt-4 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:border-ink-dim"
					>
						Reload
					</button>
				</div>
			</div>
		);
	}
}
