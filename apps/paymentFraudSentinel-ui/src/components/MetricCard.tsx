// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * A shell MiniCard with a status-colored left accent stripe. Shared by the
 * Approval queue metrics and the Submit screen's activity panel so both read
 * as the same product. When given `onClick` it also acts as a toggle filter
 * chip (hover lift + active ring).
 */

import React, { useState } from 'react';
import { MiniCard } from 'shell';
import { ACCENT } from './fx';

/** queueBucket key -> accent colour. `review` uses the design-system amber so
 * the pending-review signal reads consistently across the app; hold / cleared
 * stay on the shell's error / success semantics. */
export const QUEUE_ACCENT: Record<string, string> = {
	review: ACCENT.amber,
	hold: 'var(--rr-color-error, #dc2626)',
	cleared: 'var(--rr-color-success, #16a34a)',
};

interface MetricCardProps {
	value: number;
	label: string;
	accent?: string;
	/** Makes the tile an interactive toggle. */
	onClick?: () => void;
	/** Interactive tiles: render the pressed/active ring. */
	active?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({ value, label, accent, onClick, active }) => {
	const [hover, setHover] = useState(false);
	const interactive = typeof onClick === 'function';
	const ring = accent ?? 'var(--rr-text-secondary)';

	return (
		<div
			className={interactive ? 'pfs-focus' : undefined}
			role={interactive ? 'button' : undefined}
			tabIndex={interactive ? 0 : undefined}
			aria-pressed={interactive ? !!active : undefined}
			onClick={onClick}
			onMouseEnter={() => interactive && setHover(true)}
			onMouseLeave={() => setHover(false)}
			onKeyDown={
				interactive
					? (e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onClick?.();
							}
						}
					: undefined
			}
			style={{
				position: 'relative',
				borderRadius: 8,
				cursor: interactive ? 'pointer' : undefined,
				transition: 'box-shadow 0.12s ease, transform 0.12s ease',
				transform: interactive && hover && !active ? 'translateY(-1px)' : undefined,
				boxShadow: active
					? `0 0 0 2px ${ring}`
					: interactive && hover
						? '0 2px 10px rgba(0,0,0,0.12)'
						: undefined,
			}}
		>
			{accent && (
				<span
					style={{
						position: 'absolute',
						left: 0,
						top: 0,
						bottom: 0,
						width: 3,
						borderRadius: '8px 0 0 8px',
						background: accent,
					}}
				/>
			)}
			<MiniCard value={value} label={label} color={accent} />
		</div>
	);
};
