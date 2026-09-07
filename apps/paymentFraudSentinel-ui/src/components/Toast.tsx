// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * Minimal toast stack — the shell has no notification primitive, so this is a
 * small local one built from StatusBadge + inline styles (no new deps). Used
 * during a submit run so the queue visibly filling up feels alive.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { StatusBadge } from 'shell';
import { FX } from './fx';

type ToastVariant = 'success' | 'info' | 'warning' | 'error';

interface Toast {
	id: number;
	variant: ToastVariant;
	title: string;
	body?: string;
}

interface ToastApi {
	push: (t: Omit<Toast, 'id'>) => void;
}

const ToastCtx = createContext<ToastApi>({ push: () => undefined });

export const useToast = (): ToastApi => useContext(ToastCtx);

const styles: Record<string, React.CSSProperties> = {
	viewport: {
		position: 'fixed',
		right: 16,
		bottom: 16,
		zIndex: 9999,
		display: 'flex',
		flexDirection: 'column',
		gap: 8,
		maxWidth: 340,
		pointerEvents: 'none',
	},
	toast: {
		pointerEvents: 'auto',
		display: 'flex',
		flexDirection: 'column',
		gap: 4,
		padding: '10px 12px',
		borderRadius: 8,
		border: '1px solid var(--rr-border)',
		background: 'var(--rr-bg-paper)',
		boxShadow: '0 6px 20px rgba(0,0,0,0.14)',
		cursor: 'pointer',
	},
	row: { display: 'flex', alignItems: 'center', gap: 8 },
	title: { fontSize: 13, fontWeight: 600, color: 'var(--rr-text-primary)' },
	body: { fontSize: 12, color: 'var(--rr-text-secondary)' },
};

export const ToastProvider: React.FC<{ children: React.ReactNode; timeout?: number }> = ({
	children,
	timeout = 4500,
}) => {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const seq = useRef(0);

	const dismiss = useCallback((id: number) => {
		setToasts((cur) => cur.filter((t) => t.id !== id));
	}, []);

	const push = useCallback<ToastApi['push']>(
		(t) => {
			const id = ++seq.current;
			setToasts((cur) => [...cur.slice(-4), { ...t, id }]);
			window.setTimeout(() => dismiss(id), timeout);
		},
		[dismiss, timeout],
	);

	const api = useMemo(() => ({ push }), [push]);

	return (
		<ToastCtx.Provider value={api}>
			{children}
			<div style={styles.viewport} aria-live="polite">
				{toasts.map((t) => (
					<div
						key={t.id}
						className={FX.toastIn}
						style={styles.toast}
						onClick={() => dismiss(t.id)}
						role="status"
					>
						<div style={styles.row}>
							<StatusBadge variant={t.variant}>{t.variant === 'error' ? 'alert' : 'new'}</StatusBadge>
							<span style={styles.title}>{t.title}</span>
						</div>
						{t.body && <div style={styles.body}>{t.body}</div>}
					</div>
				))}
			</div>
		</ToastCtx.Provider>
	);
};
