# Payment Fraud Sentinel

AP invoice fraud triage for mid-size finance teams paying hundreds of vendors.
Supplier invoices are extracted, screened against a vendor master and
deterministic fraud rules, risk-scored, and routed to a **human approval
queue** — every held payment needs manual release. Reviewers can approve/reject,
run an out-of-band vendor verification, and ask a case-grounded chat assistant
about any case. Built on RocketRide (idea #4, AP Payment Fraud Sentinel).

**Deployed:** `https://staging.rocketride.ai/?appid=payment_fraud_sentinel.paymentFraudSentinel`
(RocketRide App Builder app; access via the Production team or the pending public listing).

## Setup

This is a RocketRide workspace project. The SDK/shell packages live in
`.rocketride/` (git-ignored) and are provisioned by the platform, not npm:

1. Open the repo in VS Code with the **RocketRide extension**, connect a
   workspace (Local or Cloud). This regenerates `.rocketride/` and writes
   `ROCKETRIDE_URI` / `ROCKETRIDE_APIKEY` into `.env`.
2. `cp .env.example .env` and fill in `ROCKETRIDE_ANTHROPIC_KEY` (+ `ROCKETRIDE_CLIENT_ID` if using the managed DB path).
3. `npm install` in `apps/paymentFraudSentinel-ui/` and `apps/paymentFraudSentinel-standalone/`.

## Run

```
cd apps/paymentFraudSentinel-ui && npm run dev            # App Builder shell app
cd apps/paymentFraudSentinel-standalone && npm run dev    # standalone Vite app
node --env-file=.env scripts/run_batch.mjs --pool=3       # batch-test test-data/invoices/
```

## Architecture

`payment_fraud_sentinel_v2.pipe` — webhook → `extract_facts` (LLM) →
`normalize_facts` → `schema_validate` → `agent_rocketride` (multi-wave agent:
embedded 50-record vendor lookup in-context + `tool_python` deterministic
HOLD-rule computation + `memory_internal`) → risk assessment → approval queue
(`auto_cleared` / `pending_review` / `auto_hold`). Separate webhook flows:
vendor verification, approve/reject feedback, case-grounded chat.

## Batch & cost

See [BATCH_RESULTS.md](BATCH_RESULTS.md). ~$0.40–0.75 per invoice (extraction +
agent), ~$0.10–0.20 per verification, ~$0.02–0.04 per chat question — from the
Anthropic billing dashboard; deployment traces don't expose token data.

## Caveats

- **Vendor master is embedded** — 50 synthetic records, matched in-context.
  Production connects to a real AP/ERP vendor directory (the pipeline also has a
  `rocketride_sql` managed-DB variant).
- **Verification is simulated** — the out-of-band vendor call is an LLM
  role-play placeholder; `tool_bland_ai` is a drop-in for real telephony.
- **Feedback writeback** returns an acknowledgement only in this build (no
  persistence).
