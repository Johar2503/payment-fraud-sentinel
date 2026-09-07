# Payment Fraud Sentinel — standalone frontend

A **separate** React + Vite + Tailwind app that talks to
`pipelines/payment_fraud_sentinel_v2.pipe` through the RocketRide SDK
**directly** — no platform shell, no Module Federation.

It reuses the proven pipeline-interaction logic from
`apps/paymentFraudSentinel-ui/src/lib/pipeline.ts` (per-file isolated tasks,
dead-token retry, `parseVerification` embedded-JSON fallback, chat payload
trimming), ported verbatim. Only the plumbing differs:

| Concern | Shell app | This app |
| --- | --- | --- |
| Client | injected by the platform (`useShellConnection`) | `src/lib/rrClient.tsx` builds a `RocketRideClient` from `VITE_ROCKETRIDE_*` |
| Persistence | workspace `appState` (`useWorkspace`) | `localStorage` (`src/lib/store.ts`) |
| `.pipe` import | rsbuild loader | tiny Vite plugin in `vite.config.ts` (read-only) |
| `ws` (Node) | consumed from shell | aliased to an inert stub — browser uses native `WebSocket` |

## ⚠️ Security — local / demo only

This is a **browser** bundle. Every `VITE_ROCKETRIDE_*` value (URI **and API
key**) is compiled into the client and visible to anyone who loads the page.
Use a scoped / short-lived key and **do not deploy this build to a public
URL**. For anything real, front the SDK with a same-origin server proxy so the
key stays server-side.

## Setup

```bash
cd apps/paymentFraudSentinel-standalone
cp .env.example .env      # fill in VITE_ROCKETRIDE_APIKEY + VITE_ROCKETRIDE_ANTHROPIC_KEY
pnpm install
pnpm smoke                # Node connectivity check (validate() only — no credits)
pnpm dev                  # http://localhost:5180
pnpm build                # tsc --noEmit && vite build
```

`pnpm smoke` proves the same credentials + pipeline the app uses actually
authenticate and validate against the dev server. The browser connection is
confirmed by loading `pnpm dev` and watching the "Connection: connected"
line.

## Scope

The `App.tsx` here is a **barebones scaffold** — a file input, a queue list,
and per-case Run verification / Approve / Reject / Ask controls — purely to
exercise every ported call. Styling is intentionally minimal; it comes next.

Does **not** touch `apps/paymentFraudSentinel-ui` or the `.pipe` file.
