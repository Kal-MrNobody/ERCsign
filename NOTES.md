# NOTES — confirmed API shapes

**Evidence rules for this file.**
Every claim carries a confidence tag. Only `[DOC]` may be coded against.

| Tag | Meaning |
|---|---|
| `[DOC]` | Read verbatim from the vendor doc page. Cite the URL. Safe to code against. |
| `[SEARCH]` | Paraphrase from a search-engine summary. **Not** verbatim. Must be upgraded to `[DOC]` before code depends on it. |
| `[PROMPT]` | Asserted in the project brief, not yet independently verified. |
| `[CORRECTION]` | A doc contradicted the brief. The doc wins. |

---

## 1. Privy policy engine

### 1.1 Blocker: docs are unreachable from this environment

Attempted 2026-09-12, all failed:

| URL | Result |
|---|---|
| `docs.privy.io/wallets/using-wallets/ethereum/policies` | `EGRESS_BLOCKED` |
| `privy.io/blog/turning-wallets-programmable-with-privy-policy-engine` | `EGRESS_BLOCKED` |
| `npmjs.com/package/@privy-io/server-auth` | HTTP 403 |

`docs.privy.io` and `privy.io` are both blocked by the network egress proxy.
**No Privy claim below has reached `[DOC]`. No Privy code may be written yet.**

### 1.2 What search returned (NOT yet safe to code against)

- `[SEARCH]` Policy document has `version` (`"1.0"`), `name`, `chain_type`, `rules`, `owner`.
- `[SEARCH]` A rule has `name`, `method`, `conditions[]`, `action`.
- `[SEARCH]` A condition has `field_source`, `field`, `operator`, `value`.
- `[SEARCH]` `action` is `ALLOW` or `DENY`. DENY beats ALLOW. No rule matched ⇒ DENY.
  - Consistent with `[PROMPT]` default-deny. Happy-path ALLOW must exist before layering DENY.
- `[SEARCH]` `eth_signTypedData_v4` is a supported `method`. The engine evaluates only rules
  whose `method` matches the inbound RPC method.
- `[SEARCH]` A `field_source` of `ethereum_typed_data_message` exists and **requires a
  `typed_data` parameter that declares the schema of the typed message.**
  - This is the load-bearing claim for **G0a**: it implies a rule can read *inside* an
    EIP-712 message (e.g. the EIP-3009 `to` field), not just match the method name.
  - Exact shape of `typed_data` is **unknown**. This is the single highest-risk unknown
    in the project.

### 1.3 Unverified brief assertions

- `[PROMPT]` Max one policy per wallet ⇒ adding a rule is read-modify-write with a version guard.
- `[PROMPT]` Intents expire 72h after creation.

### 1.4 Open questions blocking G0a

1. Exact JSON for an `ethereum_typed_data_message` condition, including `typed_data`.
2. Which `operator` values exist (`eq`? `in`? case sensitivity on addresses?).
3. Is the EIP-3009 recipient addressable as `to` or `message.to`? EIP-3009
   `TransferWithAuthorization` names the recipient `to`, not `recipient`.
4. Does a policy update return/accept a version for optimistic concurrency?

---

## 2. x402 / EIP-3009 attribution

- `[PROMPT]` Agent **signs**, facilitator **broadcasts**. In Pinax's module
  `facilitator = trx.from`; the real payer is decoded from the authorization.
  - ⇒ Attribute spend by decoded `payer`, **never** `tx.from`.
  - ⇒ Enforce on `eth_signTypedData_v4`, **never** `eth_sendTransaction`.
- `[PROMPT]` `x402-v0.1.0.spkg`, module `map_events` → `evm.x402.v1.Events`.
  Payment fields: `asset`, `payer`, `recipient`, `facilitator`, `amount`, `nonce`,
  `transfer_method`, `settlement_source`, `scheme`, `valid_after`, `valid_before`,
  `facilitator_allowlist_matched`, `confidence`.
- `[PROMPT]` Pinax applies **no** facilitator filtering — that filtering is our contribution.

### 2.1 Naming collision to resolve before G1

The x402 event field is `recipient`. The EIP-712 `TransferWithAuthorization` field is `to`.
The Privy rule must key on whatever the **typed message** calls it (`to`), while the
ledger keys on what the **substream** calls it (`recipient`). Do not conflate. Resolve
when 1.4(3) is answered.

---

## 3. To verify before use

- `[PROMPT]` USDC on Base = `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
  (placed in `.env.example`; confirm on-chain before sending real funds in G2).
- `[PROMPT]` Agent0 / ERC-8004 subgraph deployed on Base — `github.com/agent0lab/subgraph`.
