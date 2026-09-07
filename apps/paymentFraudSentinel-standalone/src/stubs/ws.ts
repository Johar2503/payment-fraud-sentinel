// Inert stand-in for the Node `ws` package. The RocketRide SDK only reaches
// its `import('ws')` path in Node; in the browser it uses the native WebSocket
// and never touches this module. Present only so the bundler can resolve the
// dynamic import.
export default class NotAvailableInBrowser {
	constructor() {
		throw new Error('ws is not available in the browser build (native WebSocket is used instead)');
	}
}
