# PROGRESS

One line per gate. Status is one of: `blocked`, `in progress`, `done`.

| Gate | Status | Verify command | Result |
|---|---|---|---|
| G0a Privy signature gating | **blocked (egress)** | `node scripts/g0a-signature-gate.mjs` | Credentials OK, script OK. `api.privy.io` not in network egress allowlist -> HTTP 403 at step 1 |
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

### 2026-09-12 — G0a unblocked, schema confirmed
- `docs.privy.io` still egress-blocked. Routed around it by reading Privy's **own published
  SDK source** on GitHub (`privy-io/node-sdk`), which is the wire format itself — a stronger
  source than the docs.
- **`EthereumTypedDataMessageCondition` confirmed.** A policy rule CAN key on a field inside
  an EIP-712 message. G0a's premise holds; the README fallback is not needed.
- Two corrections to the brief recorded (NOTES.md §1.5, §1.6): the "version guard" does not
  exist as an API field, and the EIP-3009 field is `to`, not `recipient`.
- Wrote `scripts/g0a-signature-gate.mjs`. Syntax-checked. Blocked only on credentials.

### 2026-09-12 — G0a blocked at the network layer
- Credentials received and written to gitignored `.env` (verified via `git check-ignore`).
- First live run failed at step 1, before any Privy logic was exercised:

      403 Host not in allowlist: api.privy.io.
      Add this host to your network egress settings to allow access.

- This is **not** a credential or code failure. The sandbox egress policy does not permit
  `api.privy.io`, the same class of block that hid `docs.privy.io`.
- Not retried: the error is deterministic, so a retry spends a cycle for no information.
- **Unblocks when the environment's egress allowlist includes the hosts in README "Network
  requirements".**
