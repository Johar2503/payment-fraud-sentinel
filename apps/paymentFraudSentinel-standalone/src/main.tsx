import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RrConnectionProvider } from './lib/rrClient';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<ErrorBoundary>
			<RrConnectionProvider>
				<App />
			</RrConnectionProvider>
		</ErrorBoundary>
	</React.StrictMode>,
);
