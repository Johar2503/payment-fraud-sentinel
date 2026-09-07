/// <reference types="vite/client" />

declare module '*.pipe' {
	const value: Record<string, unknown>;
	export default value;
}

interface ImportMetaEnv {
	readonly VITE_ROCKETRIDE_URI?: string;
	readonly VITE_ROCKETRIDE_APIKEY?: string;
	readonly VITE_ROCKETRIDE_ANTHROPIC_KEY?: string;
	readonly VITE_ROCKETRIDE_CLIENT_ID?: string;
}
interface ImportMeta {
	readonly env: ImportMetaEnv;
}
