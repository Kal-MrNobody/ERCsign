# PROGRESS

One line per gate. Status is one of: `blocked`, `in progress`, `done`.

| Gate | Status | Verify command | Result |
|---|---|---|---|
| G0a Privy signature gating | **blocked** | `node scripts/g0a-signature-gate.js` | Not written. Privy docs egress-blocked; condition schema unconfirmed. See NOTES.md §1.4 |
| G0b Substreams liveness | **blocked** | `substreams run x402-v0.1.0.spkg map_events -e $SUBSTREAMS_ENDPOINT -s -10000` | Awaiting Graph Market endpoint + token |
| G1 Ledger | not started | `psql -c 'select count(*), sum(amount_usd) from payments'` | — |
| G2 Fleet | not started | — | — |
| G3 Brains | not started | — | — |
| G4 Backtest | not started | — | — |
| G5 Enforcement loop | not started | — | — |
| G6 Surfaces | not started | — | — |
| G7 Ship | not started | — | — |

## Gate log

### 2026-09-12 — G0a opened
- Scaffolded repo, `.gitignore`, `.env.example`.
- Attempted to confirm the Privy policy condition schema per the "never invent an API
  field" rule. Three fetches, all blocked (NOTES.md §1.1).
- Search established that a `ethereum_typed_data_message` `field_source` exists and takes a
  `typed_data` parameter — the mechanism G0a depends on — but the verbatim shape is
  unconfirmed, so no code was written.
- **Stopped per rules of engagement** (two failed verifies ⇒ ask, do not improvise).
