// =============================================================================
// Inline geometric SVG icons — stroke-based, no dependency, no emoji.
// currentColor throughout so callers control hue via text color.
// =============================================================================

import React from 'react';

export interface IconProps {
	size?: number;
	className?: string;
	strokeWidth?: number;
	title?: string;
}

const base = (
	size: number,
	strokeWidth: number,
	className: string | undefined,
	title: string | undefined,
	children: React.ReactNode,
): React.ReactElement => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth={strokeWidth}
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
		aria-hidden={title ? undefined : true}
		role={title ? 'img' : undefined}
		focusable="false"
	>
		{title ? <title>{title}</title> : null}
		{children}
	</svg>
);

type C = React.FC<IconProps>;
const make =
	(children: React.ReactNode): C =>
	({ size = 16, className, strokeWidth = 1.75, title }) =>
		base(size, strokeWidth, className, title, children);

export const ChevronRight: C = make(<path d="M9 6l6 6-6 6" />);
export const ChevronDown: C = make(<path d="M6 9l6 6 6-6" />);
export const ChevronUp: C = make(<path d="M6 15l6-6 6 6" />);
export const ArrowUpDown: C = make(
	<>
		<path d="M8 4v16" />
		<path d="M5 8l3-4 3 4" />
		<path d="M16 20V4" />
		<path d="M13 16l3 4 3-4" />
	</>,
);
export const Check: C = make(<path d="M5 13l4 4L19 7" />);
export const X: C = make(
	<>
		<path d="M6 6l12 12" />
		<path d="M18 6L6 18" />
	</>,
);
export const AlertTriangle: C = make(
	<>
		<path d="M12 3.5l9 16H3l9-16z" />
		<path d="M12 10v4" />
		<path d="M12 17.5h.01" />
	</>,
);
export const ShieldCheck: C = make(
	<>
		<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
		<path d="M9 12l2 2 4-4" />
	</>,
);
export const Phone: C = make(
	<path d="M7 3h3l1.5 5-2 1.5a12 12 0 005 5l1.5-2 5 1.5v3a2 2 0 01-2 2A17 17 0 015 5a2 2 0 012-2z" />,
);
export const Database: C = make(
	<>
		<ellipse cx="12" cy="5" rx="7" ry="3" />
		<path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
		<path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" />
	</>,
);
export const Braces: C = make(
	<>
		<path d="M9 4c-2 0-2.5 1-2.5 3S6 10 4.5 10.5C6 11 6.5 12 6.5 14s.5 3 2.5 3" />
		<path d="M15 4c2 0 2.5 1 2.5 3S18 10 19.5 10.5C18 11 17.5 12 17.5 14s-.5 3-2.5 3" />
	</>,
);
export const Search: C = make(
	<>
		<circle cx="11" cy="11" r="6" />
		<path d="M20 20l-3.5-3.5" />
	</>,
);
export const Copy: C = make(
	<>
		<rect x="9" y="9" width="12" height="12" rx="2" />
		<path d="M6 15H5a2 2 0 01-2-2V5a2 2 0 012-2h8a2 2 0 012 2v1" />
	</>,
);
export const Filter: C = make(<path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" />);
export const Inbox: C = make(
	<>
		<path d="M3 12h5l2 3h4l2-3h5" />
		<path d="M5 6h14l2 6v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6l2-6z" />
	</>,
);
export const Sparkle: C = make(
	<>
		<path d="M12 3l2 5.5L19.5 11 14 13l-2 5.5L10 13 4.5 11 10 8.5 12 3z" />
	</>,
);
export const Activity: C = make(<path d="M3 12h4l3 8 4-16 3 8h4" />);
export const Building: C = make(
	<>
		<path d="M4 21V6l8-3 8 3v15" />
		<path d="M4 21h16" />
		<path d="M9 21v-4h6v4" />
		<path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01" />
	</>,
);
export const FileText: C = make(
	<>
		<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
		<path d="M14 3v5h5" />
		<path d="M9 13h6M9 17h6" />
	</>,
);
export const Send: C = make(<path d="M4 12h15M13 6l6 6-6 6" />);
export const Clock: C = make(
	<>
		<circle cx="12" cy="12" r="9" />
		<path d="M12 7v5l3 2" />
	</>,
);
export const Ban: C = make(
	<>
		<circle cx="12" cy="12" r="9" />
		<path d="M5.6 5.6l12.8 12.8" />
	</>,
);
export const Dot: C = ({ size = 16, className }) => (
	<svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
		<circle cx="12" cy="12" r="4" fill="currentColor" />
	</svg>
);
