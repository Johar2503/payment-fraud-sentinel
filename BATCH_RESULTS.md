# Batch Test Results

Pipeline: `pipelines/payment_fraud_sentinel_v2.pipe` · runner: `scripts/run_batch.mjs --pool=3`

## Volume

| Metric | Value |
| --- | --- |
| Total invoices | 8 (7 completed, 1 expected malformed failure) |
| `auto_cleared` | 2 |
| `pending_review` | 3 |
| `auto_hold` | 2 |

## Detection

- **Deterministic HOLD:** 2/2 full-fraud cases held — all three rules (payee
  bank not on file, amount > 2× vendor mean, vendor < 30 days old) fired on both.
- **Accuracy:** 7/7 (100%) expected vs. actual `queue_status`.

## Timing

| Metric | Value |
| --- | --- |
| Average | 133 s |
| Median | 123 s |
| p95 | 191 s |
| Wall clock (pool = 3) | 467 s |

## Cost

| Operation | Estimate |
| --- | --- |
| Invoice triage | ~$0.40–0.75 |
| Vendor verification | ~$0.10–0.20 |
| Chat question | ~$0.02–0.04 |

Token/cost data is **not exposed by the deployment's pipeline traces** — figures
above are taken from the Anthropic billing dashboard, not a per-run calculation.
