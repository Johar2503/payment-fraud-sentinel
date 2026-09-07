import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Repo root — the pipeline definition and the vendored SDK tarball live above
// this project, so the dev server must be allowed to read them.
const REPO_ROOT = path.resolve(__dirname, '../..');

/** Import a `.pipe` file (JSON with a non-standard extension) as a default
 * export, mirroring the rsbuild `.pipe` loader the shell app uses. Read-only —
 * the pipeline file itself is never modified. */
function pipeAsJson(): Plugin {
	return {
		name: 'pipe-as-json',
		transform(code, id) {
			if (!id.endsWith('.pipe')) return null;
			return { code: `export default ${JSON.stringify(JSON.parse(code))};`, map: null };
		},
	};
}

export default defineConfig({
	plugins: [react(), pipeAsJson()],
	resolve: {
		alias: {
			// The SDK's Node-only `ws` fallback is never reached in a browser
			// (TransportWebSocket short-circuits on `typeof window`), but the bundler
			// still resolves the dynamic import — point it at an inert stub.
			ws: path.resolve(__dirname, 'src/stubs/ws.ts'),
		},
	},
	optimizeDeps: { exclude: ['ws'] },
	server: {
		port: 5180,
		fs: { allow: [REPO_ROOT] },
	},
});
