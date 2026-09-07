// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * Payment Fraud Sentinel — AP invoice fraud triage & human approval queue.
 * Root component rendered by the RocketRide shell.
 */

import React, { useMemo, useState } from 'react';
import { AppLayout, Banner, Button, EmptyState, SidebarMenu } from 'shell';
import type { ShellAppProps } from 'shell';
import { FxStyles } from './components/fx';
import { ToastProvider } from './components/Toast';
import { queueBucket, useCaseStore } from './lib/cases';
import { usePipeline } from './lib/pipeline';
import QueueView from './views/QueueView';
import SubmitView from './views/SubmitView';

type Page = 'queue' | 'submit';

const centered: React.CSSProperties = {
	height: '100%',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	padding: 40,
};

const App: React.FC<ShellAppProps> = ({ isConnected, identity }) => {
	const [page, setPage] = useState<Page>('queue');
	const store = useCaseStore();
	const api = usePipeline();

	const reviewer =
		identity?.displayName || identity?.email || identity?.userId || 'unknown reviewer';

	const openCount = useMemo(
		() => store.cases.filter((r) => ['review', 'hold'].includes(queueBucket(r))).length,
		[store.cases],
	);

	const sidebar = useMemo(
		() => (
			<SidebarMenu
				sectionLabel="Payment Fraud Sentinel"
				activeId={page}
				onSelect={(id) => setPage(id as Page)}
				menu={{
					entries: [
						{ id: 'queue', label: 'Approval queue', count: openCount || undefined, severity: openCount ? 'error' : undefined },
						{ id: 'submit', label: 'Submit invoices' },
					],
				}}
			/>
		),
		[page, openCount],
	);

	let body: React.ReactNode;
	if (!isConnected) {
		body = (
			<div style={centered}>
				<EmptyState
					title="Waiting for RocketRide"
					description="Payment Fraud Sentinel connects to the triage pipeline automatically once the workspace is online."
				/>
			</div>
		);
	} else if (!store.loaded) {
		body = (
			<div style={centered}>
				<EmptyState title="Restoring your queue" description="Loading previously triaged payments from this workspace." />
			</div>
		);
	} else if (api.error) {
		body = (
			<div style={centered}>
				<EmptyState
					title="Can't reach the fraud pipeline"
					description={api.error}
					action={<Button onClick={api.retry}>Retry connection</Button>}
				/>
			</div>
		);
	} else if (page === 'submit') {
		body = <SubmitView store={store} api={api} onDone={() => setPage('queue')} />;
	} else {
		body = (
			<QueueView store={store} api={api} reviewer={reviewer} onSubmitNav={() => setPage('submit')} />
		);
	}

	return (
		// display:contents — a font-family carrier only, no box, no layout effect.
		// Wraps the whole tree (toasts included) so the IBM Plex overlay is global.
		<div className="pfs-app" style={{ display: 'contents' }}>
			<ToastProvider>
				<FxStyles />
				<AppLayout sidebar={sidebar} showStatus>
					{!api.ready && isConnected && store.loaded && !api.error && (
						<Banner variant="info">Starting the fraud pipeline tasks…</Banner>
					)}
					{body}
				</AppLayout>
			</ToastProvider>
		</div>
	);
};

export default App;
