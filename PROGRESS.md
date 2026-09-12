# PROGRESS

One line per gate. Status is one of: `blocked`, `in progress`, `done`.

| Gate | Status | Verify command | Result |
|---|---|---|---|
| G0a Privy signature gating | **done** ✅ | `node --env-file=.env scripts/g0a-signature-gate.mjs` | **PASS.** Sign → 200; append DENY on `message.to`; identical payload → **400 `policy_violation`**; different vendor, same wallet → 200. Deterministic over 3 runs. Fallback NOT needed |
| G0b Substreams liveness | **done** ✅ | `./scripts/g0b-liveness.sh` | **PASS.** 12,351 live payments over 10,145 Base blocks via a Graph Market endpoint. `payer != tx.from` on **99.6 %** of them; `payer` never empty; 0 `payment_id` collisions |
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

### 2026-09-12 — session 2: egress restored, both G0 gates verified as far as credentials allow

- **The egress block is gone.** Re-tested at session start: `api.privy.io` answers (404 at
  `/`, i.e. the API, not the proxy), `docs.privy.io` is 200, and every other partner host
  resolves. Node's built-in `fetch` reaches Privy too. NOTES.md §4.1.
- **`.env` did not survive the container.** The credentials the previous session received
  are gone; the container is reclaimed between sessions. This is now the only G0a blocker.
- **G0a script verified against the wire format, not just re-read.** Pulled Privy's own
  `node-sdk` source and confirmed every call the script makes. Closed a real bug risk: the
  RPC param is `typed_data` with `primary_type` (snake_case), while `domain` is a free-form
  passthrough that must keep EIP-712 camelCase. The script already had both right. §4.3
- **G0b groundwork done without credentials.** Installed `substreams` v1.16.6, pulled the
  genuine `x402-v0.1.0.spkg`, and inspected it. `map_events -> proto:evm.x402.v1.Events`
  confirmed, and the package doc states verbatim that it applies no facilitator filtering —
  confirming our contribution. All 13 `Payment` fields confirmed from the descriptor. §4.5
- **Schema correction found for G1.** `Payment` is nested at
  `Events.transactions[].logs[].payment`; `transaction.from` (the facilitator) sits one level
  above `payment.payer` (the real spender). The nesting makes the misattribution bug the
  brief warns about easy to write by accident. §4.6
- **Open before the G1 schema freeze:** the proto has `Log.block_index` and `Log.ordinal`
  but no `log_index`, so `payment_id = tx_hash:log_index` needs a live row to settle. §4.7
- Stopped to ask for credentials rather than improvise.

### 2026-09-12 — session 2 addendum: a G1 assumption in the brief does not hold

Investigated the G1 composition before writing any of it, and found a blocker worth
surfacing now rather than at G1:

- **`erc20-tokens` does not carry `decimals`.** The brief's G1 specifies "USD normalisation
  via token decimals" from that package. It has 66 message types, all protocol-specific
  admin/lifecycle events (USDC mint/burn/blacklist/AuthorizationUsed, USDT, WBTC, SAI,
  stETH, WETH) — no `decimals`, no `symbol`, not even a plain ERC-20 `Transfer`.
- **No prebuilt Pinax package has it.** Checked five (`erc20-tokens`, `erc20-transfers`,
  `erc20-balances`, `evm-contracts`, `evm-transfers`): zero occurrences of `decimals`.
- **Proposed resolution** (NOTES.md §5.3): source `decimals()` with an `eth_call` per
  newly-seen asset, memoised in a store, built as a standalone reusable
  `store_token_decimals` module. Pinax already does RPC-from-module in `erc20/balances`, so
  it is idiomatic. This converts the gap into a *reusable composable module*, which is
  exactly what The Graph's Composable track rewards. Hardcoding `USDC = 6` is rejected
  because G6 requires the tooling to work against any fleet.
- **Good news for the composition story:** Pinax's `evm-transfers` aggregator composes
  erc20_transfers + erc20_tokens + native_transfers and does *not* include the x402 package.
  So composing `x402:map_events` with `erc20_tokens:map_events` is genuinely novel work.
- **Good news for ground truth #1:** Base is an EXTENDED-detail chain, so the trace-dependent
  `transferWithAuthorization` calldata decode — which is what makes `payer` trustworthy — is
  available on our target chain. Confirm `payer` is non-empty on the first live G0b row.

### 2026-09-12 — G0a PASSED

Credentials arrived; ran the kill test live against `api.privy.io`.

```
[3] Sign TransferWithAuthorization to 0x…dEaD          -> 200 SIGNED
[4] Append DENY on message.to == 0x…dEaD               -> rule created
[5] Sign the BYTE-IDENTICAL payload again              -> 400 REFUSED  (policy_violation)
[6] Sign to a DIFFERENT vendor, same wallet + policy   -> 200 SIGNED
```

**The mission's central mechanism is confirmed real.** Privy refuses a signature based on a
field *inside* the EIP-712 message, server-side, at signing time. The agent never obtains a
signature to hand to a facilitator. The README fallback is not needed and has been dropped.

Step 6 was added during the run and is load-bearing: steps 1–5 alone would look identical if
the DENY were blocking *all* typed-data signing, so the control proves the rule is keyed on
`to` specifically. It immediately caught a false signal (see below).

Findings recorded in NOTES.md §6:

- **Four API constraints the SDK types do not express** (all found via live 400s): typed-data
  rules need ≥1 condition, so there is no blanket ALLOW; `chainId` rejects operator `in`;
  `chainId` values must be numerical strings; rule names are capped at 50 chars, so G3 must
  generate names from a truncated address.
- **Privy validates addresses against their EIP-55 checksum** and rejects a mismatch with
  `invalid_data` *before* the policy engine runs. Both that and a real refusal are 400s, so
  the assertions now require `code === 'policy_violation'` — otherwise the test could report
  a result for entirely the wrong reason. This is exactly what step 6 caught.
- **Policy address matching is case-insensitive — verified, not assumed.** Our substreams
  emits lowercase and agents may sign checksummed; had this been case-sensitive, every rule
  G3 generates would have silently failed open. A lowercase rule refuses a checksummed
  payload. No normalisation layer needed.
- Rules carry a server-assigned `id`, so `DELETE /v1/policies/{id}/rules/{rule_id}` gives G5
  a rollback path for a mistaken enforcement.

Next: G0b, which needs the Graph Market endpoint + token.

### 2026-09-12 — G0b PASSED, and it validates the project's core claim

Streamed `x402-v0.1.0.spkg map_events` from `base-mainnet.streamingfast.io:443` using a
Graph Market key. 10,145 blocks processed, exit 0.

```
payments         : 12,351
payer != tx.from : 12,291  (99.6 %)
payer == tx.from :     51  ( 0.4 %)
payer empty      :      0
```

**Ground truth #1 is now an empirical finding, not an assumption.** In every inspected row
`facilitator == tx.from` exactly while `payer` is an unrelated address, so attributing spend
by `tx.from` would misattribute **99.6 % of all x402 payments on Base** to whichever
facilitator relayed them. Reproduced at 99.6 % on a second independent window via
`scripts/g0b-liveness.sh`. This number belongs in the README and the video.

Other findings (NOTES.md §7):

- **`[CORRECTION]` the API key is not the API token.** A `server_` key is rejected by the
  endpoints outright; it must be exchanged for a JWT at `auth.thegraph.market/v1/auth/issue`.
  `.env` now separates `SUBSTREAMS_API_KEY` (durable) from `SUBSTREAMS_API_TOKEN` (the JWT),
  and `scripts/substreams-auth.sh` does the exchange. The key is rejected by
  `auth.pinax.network`, which confirms it is a Graph Market key — the provider the prize
  rules require.
- **`payer` is never empty** (0 / 12,351), confirming the §5.6 prediction that Base's
  EXTENDED detail level makes the trace-dependent decode reliable.
- **USDC on Base verified on-chain** (12,341 / 12,351 payments) — ground truth #3 upgraded
  from `[PROMPT]` to observed. A second asset also appeared, which is exactly why hardcoding
  decimals is the wrong call.
- **418 distinct facilitators** in ~5.5 hours, so R4 will fire on real data, not just planted
  data.
- **⚠️ every payment is `confidence: "heuristic"`** — a string, and nothing is "exact". We
  reconstruct payments rather than prove settlement, so `confidence` must be carried into the
  `payments` table and surfaced at G6 rather than quietly dropped.
- **§4.7 resolved:** both `(block, blockIndex)` and `(tx_hash, ordinal)` are collision-free
  over 12,351 rows. Freeze `payment_id = tx_hash:blockIndex` at G1 — `blockIndex` is the
  receipt log index a judge can verify on an explorer; `ordinal` is a Firehose counter that
  cannot be.

Both G0 kill tests are now passed. Next: G1.
