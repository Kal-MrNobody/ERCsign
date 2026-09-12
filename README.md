# RedFlag_Trail

Reconstruct an AI agent fleet's x402 spend from live on-chain data, flag risky vendors, and
turn each finding into a wallet policy rule that a human quorum approves — and that then
blocks the next payment **at signing time**.

Built for ETHOnline 2026.

## The core idea

In x402, the agent **signs** an EIP-3009 authorization and a **facilitator** broadcasts it.
So the on-chain `tx.from` is the facilitator, not the spender. Attributing spend by `tx.from`
attributes every agent's spend to whichever facilitator relayed it.

RedFlag_Trail attributes spend by the `payer` decoded from the authorization, and enforces on
`eth_signTypedData_v4` — the moment of signing — rather than on `eth_sendTransaction`, which
the agent never calls.

## Setup

```bash
./scripts/bootstrap.sh   # substreams CLI + pinned Substreams packages into vendor/
cp .env.example .env     # then fill in
```

`bootstrap.sh` is idempotent. It pins `substreams` v1.16.6 and fetches the prebuilt Pinax
packages from `raw.githubusercontent.com` (the GitHub **API** is not used — see NOTES.md
§4.2), then prints each package's module hashes so the versions are auditable.

## Network requirements

This project talks to live third-party APIs by design — mocked or local-only data
disqualifies the Graph tracks. When running inside a sandboxed environment, these hosts must
be on the network egress allowlist:

| Host | Needed for |
|---|---|
| `api.privy.io` | Privy wallet + policy API (G0a, G2, G5) |
| `docs.privy.io` | Privy documentation lookups |
| `*.thegraph.com` | Graph Market Substreams endpoint, Subgraph Studio (G0b, G1, G3) |
| `mainnet.base.org` | Base RPC (G2) |
| `*.pinax.network` | Prebuilt Substreams packages (G1) |
| `bazantic.com` | Gateway and Recipes (G7) |

Also required: `raw.githubusercontent.com` and `github.com` (release downloads), used by
`bootstrap.sh`.

A blocked host surfaces as `403 Host not in allowlist: <host>`.

## Status

Both G0 kill tests are verified as far as they can be without credentials:

- **G0a — PASSED.** ✅ Verified live: sign an EIP-3009 authorization → `200`; add a DENY
  rule keyed on the `to` field *inside* the typed message; sign the byte-identical payload
  again → **`400 policy_violation`**; sign to a different vendor on the same wallet →
  `200`. Enforcement is server-side at signing time, so the agent never obtains a signature
  to hand to a facilitator — and the pre-sign-gate fallback is **not** needed.
- **G0b** — `substreams` v1.16.6 installed, the genuine `x402-v0.1.0.spkg` fetched and
  inspected: `map_events -> proto:evm.x402.v1.Events`, and all 13 `Payment` fields confirmed
  from the package's own descriptor.

G0b needs the Graph Market endpoint + token. See `PROGRESS.md` for the gate ledger and
`NOTES.md` for every confirmed API shape with its evidence grade.

### Reproducing G0a

```bash
cp .env.example .env    # set PRIVY_APP_ID and PRIVY_APP_SECRET
node --env-file=.env scripts/g0a-signature-gate.mjs
```

Exit code 0 means Privy refused the second signature *and* still signed for a different
vendor. The script fails loudly rather than reporting a pass if either half does not hold —
a refusal that is not `code: policy_violation` is treated as invalid, not as success.
