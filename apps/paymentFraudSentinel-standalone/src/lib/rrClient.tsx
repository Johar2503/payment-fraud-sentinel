// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/** Standalone replacement for the shell's `useShellConnection()`.
 *
 * The shell app gets its RocketRideClient (already authenticated, per-user
 * tasks) injected by the platform. Here there is no platform: we construct the
 * client ourselves from VITE_ROCKETRIDE_* env, connect once, and expose the
 * same `{ client, isConnected }` shape the ported pipeline.ts expects.
 *
 * SECURITY: the API key is bundled into the browser build. Local / demo only.
 */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { RocketRideClient } from 'rocketride';

const URI = import.meta.env.VITE_ROCKETRIDE_URI ?? '';
const APIKEY = import.meta.env.VITE_ROCKETRIDE_APIKEY ?? '';
const ANTHROPIC_KEY = import.meta.env.VITE_ROCKETRIDE_ANTHROPIC_KEY ?? '';
// Signed-in account user id. The managed rocketride_sql nodes (vendor lookup in the
// invoice flow, risk_history writeback in the decision flow) need it to resolve the
// account's Postgres credential; without it they fail with
// `password authentication failed for user "rocketride"`. In the shell app the VS Code
// extension injects this automatically — here we have no ambient env, so forward it.
const CLIENT_ID = import.meta.env.VITE_ROCKETRIDE_CLIENT_ID ?? '';

/** ROCKETRIDE_*-named map the SDK filters and rides along with `use()` so the
 * server can resolve `${ROCKETRIDE_ANTHROPIC_KEY}` etc. in the pipeline. */
const ENV: Record<string, string> = {
	ROCKETRIDE_URI: URI,
	ROCKETRIDE_APIKEY: APIKEY,
	...(ANTHROPIC_KEY ? { ROCKETRIDE_ANTHROPIC_KEY: ANTHROPIC_KEY } : {}),
	...(CLIENT_ID ? { ROCKETRIDE_CLIENT_ID: CLIENT_ID } : {}),
};

export interface RrConnection {
	client: RocketRideClient | null;
	isConnected: boolean;
	error: string | null;
	retry: () => void;
}

const Ctx = createContext<RrConnection>({ client: null, isConnected: false, error: null, retry: () => {} });

export const useRrConnection = (): RrConnection => useContext(Ctx);

export const RrConnectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const clientRef = useRef<RocketRideClient | null>(null);
	const [isConnected, setConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [attempt, setAttempt] = useState(0);

	if (!clientRef.current) {
		if (!URI || !APIKEY) {
			// Surface the misconfig instead of throwing during render.
			if (!error) setError('Missing VITE_ROCKETRIDE_URI / VITE_ROCKETRIDE_APIKEY — copy .env.example to .env.');
		} else {
			clientRef.current = new RocketRideClient({
				uri: URI,
				auth: APIKEY,
				env: ENV,
				persist: true,
				onEvent: async () => {},
				onConnected: async () => {
					setConnected(true);
					setError(null);
				},
				onDisconnected: async () => {
					setConnected(false);
				},
			});
		}
	}

	useEffect(() => {
		const client = clientRef.current;
		if (!client) return;
		let cancelled = false;
		setError(null);
		(async () => {
			try {
				await client.connect(APIKEY);
				if (!cancelled) setConnected(client.isConnected());
			} catch (e) {
				if (!cancelled) setError(e instanceof Error ? e.message : String(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [attempt]);

	const value = useMemo<RrConnection>(
		() => ({
			client: clientRef.current,
			isConnected,
			error,
			retry: () => {
				setConnected(false);
				setAttempt((n) => n + 1);
			},
		}),
		[isConnected, error],
	);

	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
