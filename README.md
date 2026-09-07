# Payment Fraud Sentinel

An AP invoice fraud-triage tool built on RocketRide. Supplier invoices are
extracted, screened against a vendor master and a set of deterministic fraud
rules, scored for risk, and routed to a human approval queue. Reviewers can
approve/reject, trigger an out-of-band vendor verification, and ask a
case-grounded chat assistant questions about any case.

## Run

```
# App Builder shell app (deployed target)
cd apps/paymentFraudSentinel-ui && npm run dev

# Standalone Vite app
cd apps/paymentFraudSentinel-standalone && npm run dev

# Seed the 50 synthetic vendor records (managed DB path only)
node --env-file=.env scripts/seed_vendors.mjs

# Batch-test the pipeline against test-data/invoices/
node --env-file=.env scripts/run_batch.mjs --pool=3
```

## Architecture

`extract_facts` (LLM extraction + schema validation) → `agent_rocketride`
(embedded 50-record vendor lookup done in-context + `tool_python` deterministic
HOLD-rule computation) → risk assessment → human approval queue
(`auto_cleared` / `pending_review` / `auto_hold`) → case-grounded chat
assistant. Separate webhook flows handle vendor verification and approve/reject
feedback.

## Caveats

- **Vendor master is embedded** as 50 synthetic records for the demo. Production
  would connect to a real AP/ERP vendor directory instead of the embedded list.
- **Verification is simulated** — the out-of-band vendor call is an LLM
  role-play placeholder. The architecture supports real telephony via
  `tool_bland_ai` as a drop-in replacement for that node.
