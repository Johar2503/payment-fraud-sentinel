# Payment Fraud Sentinel

AP invoice fraud triage and human approval queue for mid-size finance teams.

## What it does

Upload supplier invoices; each one runs through
`pipelines/payment_fraud_sentinel_v2.pipe`:

1. **Extract & validate** — 10 AP fields with provenance (`extract_facts` →
   `normalize_facts` → `schema_validate`).
2. **Triage agent** (`agent_rocketride`) — looks up the vendor master
   (`rocketride_sql`), runs the deterministic HOLD rule in Python
   (`tool_python`: bank account not on file **AND** amount > 2× the vendor's
   historical mean **AND** vendor first seen < 30 days), assesses fraud
   indicators, and emits the full case with a `queue_status` of
   `auto_cleared`, `pending_review`, or `auto_hold`.
3. **Approval queue** — everything not auto-cleared lands here for a human.

Reviewers can:

- **Run verification** — an async out-of-band vendor-call simulation
  (`webhook_verify`; placeholder for a real telephony integration) that
  attaches a transcript and a confirmed/suspicious verdict.
- **Approve / Reject** — the decision is written back to the vendor's
  `risk_history` (`webhook_feedback` → `rocketride_sql`).

## Screens

| View | What it shows |
|---|---|
| **Approval queue** | Metrics + a filterable grid of cases; click a row for the full case detail panel with the verify / approve / reject actions. |
| **Submit invoices** | Drop-zone upload; each file becomes one queue case. |

## Pipeline wiring

`src/lib/pipeline.ts` owns all pipeline I/O. `webhook_verify` and
`webhook_feedback` each use one long-lived per-user task (`send`). Invoice
submission does **not**: a reused webhook task merges results across objects,
so `submitInvoices` processes files one at a time, each on a fresh isolated
task it starts, sends the single file to, parses, and terminates — with a
per-file `onProgress` callback so the Submit view drops each case into the
queue as it lands. `agent_rocketride` emits an intermediate answer plus the
final JSON, so `pending_review` is an array; `parsePendingReview()` takes the
last element that parses to a case object. The queue is persisted per user in
workspace `appState` (`src/lib/cases.ts`).

## Development

Open the `.rrapp` file to launch the App Builder — live preview on the
Design tab. The pipeline definition is imported from `pipelines/` and packed
with the app via `appManifest.include`.

Platform guide: `.rocketride/docs/ROCKETRIDE_APPS.md`.
