# Payment Fraud Sentinel

AP invoice fraud triage for mid-size finance teams paying hundreds of vendors.
Supplier invoices are extracted, screened against a vendor master and
deterministic fraud rules, risk-scored, and routed to a **human approval
queue** — every held payment needs manual release. Reviewers can approve/reject,
run an out-of-band vendor verification, and ask a case-grounded chat assistant
about any case. Built on RocketRide (idea #4, AP Payment Fraud Sentinel).

---

## Just want to see it run?

Open the deployed app — no setup:

**https://staging.rocketride.ai/?appid=payment_fraud_sentinel.paymentFraudSentinel**

(RocketRide App Builder app. Sign in to RocketRide; access is via the Production
team or the pending public listing.)

---

## Run it locally — step by step

### 1. Prerequisites

- **VS Code** (or Cursor / Windsurf) with the **RocketRide extension** installed
  (Marketplace → search "RocketRide"; on Cursor/Windsurf use Open VSX).
- **Node.js 18+** and npm.
- An **Anthropic API key** (`sk-ant-…`). RocketRide credits do **not** cover
  model calls — you bring your own key.

### 2. Get the code

```
git clone https://github.com/Johar2503/payment-fraud-sentinel.git
cd payment-fraud-sentinel
```

### 3. Connect a RocketRide workspace

Open the folder in VS Code. In the RocketRide extension settings →
**Development → Connection mode**, pick **Local** (downloads a local engine, no
account) or **RocketRide Cloud** (sign in, pick a team), then **Save All
Settings**.

Connecting does two things automatically:
- creates `.rocketride/` with the SDK + shell packages this repo needs
  (they're platform-provisioned, not on npm — that's why they're git-ignored), and
- writes `ROCKETRIDE_URI` and `ROCKETRIDE_APIKEY` into `.env`.

### 4. Fill in `.env`

```
cp .env.example .env
```

Then edit `.env` and set:
- `ROCKETRIDE_ANTHROPIC_KEY=sk-ant-…`  (required — the pipeline's LLM nodes)
- `ROCKETRIDE_CLIENT_ID=…`  (only if you use the managed-DB variant of the pipeline)

`ROCKETRIDE_URI` / `ROCKETRIDE_APIKEY` are already filled by step 3.

### 5. Install dependencies

```
cd apps/paymentFraudSentinel-ui        && npm install && cd ../..
cd apps/paymentFraudSentinel-standalone && npm install && cd ../..
```

### 6. Start the app

**App Builder shell app** (the deployed one):

```
cd apps/paymentFraudSentinel-ui
npm run dev
```

It prints a local URL — open it in the browser. The RocketRide shell loads with
the Payment Fraud Sentinel app.

**Standalone Vite app** (same features, plain React, talks to the SDK directly):

```
cd apps/paymentFraudSentinel-standalone
npm run dev            # → http://localhost:5180
```

### 7. Try it

In the **Submit** view, drop a file from `test-data/invoices/` — e.g.
`clean_01.txt` (clears) or `fraud_hold_01.txt` (auto-hold). Each file takes
~1–2 minutes. Finished cases land in the **approval queue**; open one to see the
investigation timeline, run verification, or ask the chat assistant.

### 8. Batch test (optional)

```
node --env-file=.env scripts/run_batch.mjs --pool=3
```

Runs the folder of test invoices through the pipeline concurrently and prints a
triage summary. See [BATCH_RESULTS.md](BATCH_RESULTS.md) for recorded numbers.

---

## Architecture

`payment_fraud_sentinel_v2.pipe` — webhook → `extract_facts` (LLM) →
`normalize_facts` → `schema_validate` → `agent_rocketride` (multi-wave agent:
embedded 50-record vendor lookup in-context + `tool_python` deterministic
HOLD-rule computation + `memory_internal`) → risk assessment → approval queue
(`auto_cleared` / `pending_review` / `auto_hold`). Separate webhook flows:
vendor verification, approve/reject feedback, case-grounded chat.

## Cost

~$0.40–0.75 per invoice (extraction + agent), ~$0.10–0.20 per verification,
~$0.02–0.04 per chat question — from the Anthropic billing dashboard;
deployment traces don't expose token data.

## Caveats

- **Vendor master is embedded** — 50 synthetic records, matched in-context.
  Production connects to a real AP/ERP vendor directory (the pipeline also has a
  `rocketride_sql` managed-DB variant).
- **Verification is simulated** — the out-of-band vendor call is an LLM
  role-play placeholder; `tool_bland_ai` is a drop-in for real telephony.
- **Feedback writeback** returns an acknowledgement only in this build (no
  persistence).
