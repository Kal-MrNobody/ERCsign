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

## Status

Pre-G0. See `PROGRESS.md` for the gate ledger and `NOTES.md` for confirmed API shapes.

## Setup

```bash
cp .env.example .env   # then fill in
```

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

A blocked host surfaces as `403 Host not in allowlist: <host>`.
