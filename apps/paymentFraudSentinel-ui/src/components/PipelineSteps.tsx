// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * A compact 4-step strip of the triage pipeline stages, shown on the Submit
 * screen so an invoice's journey is visible before it is dropped. Icons from
 * the shell set; entrance uses the shared FX fade-up.
 */

import React from 'react';
import { BxChevronRight, BxFile, BxListUl, BxSearch, BxShow } from 'shell';
import type { IconComponent } from 'shell';
import { FX } from './fx';

const STEPS: { icon: IconComponent; label: string }[] = [
	{ icon: BxFile, label: 'Extract & validate' },
	{ icon: BxSearch, label: 'Vendor lookup' },
	{ icon: BxShow, label: 'Fraud assessment' },
	{ icon: BxListUl, label: 'Approval queue' },
];

const s: Record<string, React.CSSProperties> = {
	wrap: {
		display: 'flex',
		alignItems: 'flex-start',
		justifyContent: 'center',
		flexWrap: 'wrap',
		gap: 4,
		padding: '4px 0 14px',
	},
	step: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 96, textAlign: 'center' },
	badge: { position: 'relative' },
	circle: {
		width: 36,
		height: 36,
		borderRadius: '50%',
		border: '1px solid var(--rr-border)',
		background: 'var(--rr-bg-paper)',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		color: 'var(--rr-text-secondary)',
	},
	num: {
		position: 'absolute',
		top: -4,
		right: -4,
		width: 14,
		height: 14,
		borderRadius: '50%',
		fontSize: 9,
		fontWeight: 700,
		lineHeight: 1,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		background: 'var(--rr-text-secondary)',
		color: 'var(--rr-bg-paper)',
	},
	label: {
		fontSize: 10.5,
		fontWeight: 600,
		letterSpacing: '0.02em',
		color: 'var(--rr-text-secondary)',
		lineHeight: 1.3,
	},
	chev: { display: 'flex', alignItems: 'center', height: 36, color: 'var(--rr-border)' },
};

const PipelineSteps: React.FC = () => (
	<div style={s.wrap}>
		{STEPS.map((step, i) => {
			const Icon = step.icon;
			return (
				<React.Fragment key={step.label}>
					<div className={FX.fadeUp} style={{ ...s.step, animationDelay: `${i * 90}ms` }}>
						<div style={s.badge}>
							<div style={s.circle}>
								<Icon size={18} />
							</div>
							<span style={s.num}>{i + 1}</span>
						</div>
						<div style={s.label}>{step.label}</div>
					</div>
					{i < STEPS.length - 1 && (
						<div className={FX.fadeUp} style={{ ...s.chev, animationDelay: `${i * 90 + 45}ms` }}>
							<BxChevronRight size={18} />
						</div>
					)}
				</React.Fragment>
			);
		})}
	</div>
);

export default PipelineSteps;
