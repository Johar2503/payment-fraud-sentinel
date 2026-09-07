/** @type {import('tailwindcss').Config} */
export default {
	content: ['./index.html', './src/**/*.{ts,tsx}'],
	theme: {
		extend: {
			colors: {
				// --- Payment Fraud Sentinel design system --------------------------
				// Authority/trust product for AP analysts. Flat colors only, no
				// gradients. Amber == risk/warning ONLY. Violet == AI-generated
				// content ONLY. Red == destructive / do-not-pay.
				ground: '#0F172A', // app background (slate-950)
				surface: '#222735', // card
				'surface-2': '#1B2130', // nested / code panels (derived, same family)
				line: '#334155', // borders
				ink: '#F8FAFC', // foreground
				'ink-dim': '#9AA7B8', // secondary text (~5.5:1 on surface)
				'ink-faint': '#8A97A8', // tertiary text (~4.6:1 on surface — still meets AA)
				'ink-mute': '#64748B', // non-text: rules, disabled glyphs, decorative
				amber: '#F59E0B', // risk / warning accent
				'amber-soft': '#F5B942',
				violet: '#8B5CF6', // AI-attributed content accent (FLAT, never a gradient)
				danger: '#EF4444', // destructive / critical / reject
			},
			fontFamily: {
				sans: [
					'"IBM Plex Sans"',
					'ui-sans-serif',
					'system-ui',
					'-apple-system',
					'"Segoe UI"',
					'Roboto',
					'sans-serif',
				],
				mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
			},
			borderRadius: { card: '10px' },
		},
	},
	plugins: [],
};
