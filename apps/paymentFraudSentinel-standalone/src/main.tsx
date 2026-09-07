import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RrConnectionProvider } from './lib/rrClient';
import './index.css';

// Public demo: every fresh open starts with an empty queue. On the first load in
// a tab, clear any persisted state left by a previous visitor on this browser.
// A reload within the same tab keeps state, so a judge doesn't lose an in-flight
// invoice. (Different browsers/devices are already isolated by localStorage.)
try {
	if (!sessionStorage.getItem('pfs-standalone:session')) {
		for (const k of Object.keys(localStorage)) {
			if (k.startsWith('pfs-standalone:')) localStorage.removeItem(k);
		}
		sessionStorage.setItem('pfs-standalone:session', '1');
	}
} catch {
	/* storage blocked (private mode / disabled) — nothing to clear */
}

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<ErrorBoundary>
			<RrConnectionProvider>
				<App />
			</RrConnectionProvider>
		</ErrorBoundary>
	</React.StrictMode>,
);
