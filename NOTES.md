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

### 1.1 Source of truth

`docs.privy.io` and `privy.io` remain **egress-blocked** from this environment. Resolved by
reading Privy's own published source on GitHub instead, which is strictly better than the
docs — it is the wire format itself.

| Source | Grade |
|---|---|
| `privy-io/node-sdk` → `src/resources/policies.ts` | `[DOC]` authoritative |
| `privy-io/node-sdk` → `src/resources/wallets/wallets.ts` | `[DOC]` authoritative |
| `privy-io/node-sdk` → `api.md` | `[DOC]` type index |
| `privy-io/privy-agentic-wallets-skill` → `references/*.md` | `[DOC]` official, example-grade |

### 1.2 G0a IS SUPPORTED — fallback not needed

`[DOC]` A policy condition **can read fields inside an EIP-712 message**:

```ts
export interface EthereumTypedDataMessageCondition {
  field: string;                                 // free-form path, e.g. "to"
  field_source: 'ethereum_typed_data_message';
  operator: ConditionOperator;
  typed_data: TypedDataInput;                    // declares the schema to parse against
  value: ConditionValue;
}

export interface TypedDataInput {                // NOTE: schema only, no domain/message
  primary_type: string;
  types: { [key: string]: Array<{ name: string; type: string }> };
}
```

There is also `EthereumTypedDataDomainCondition` with
`field: 'chainId' | 'verifyingContract' | 'chain_id' | 'verifying_contract'`, usable to pin
the DENY to USDC-on-Base specifically.

⇒ **The G0a README fallback (pre-sign gate in our own x402 client) is NOT required.**
Enforcement happens inside Privy, at signing time, exactly as the mission requires.

### 1.3 Confirmed enums

```ts
type PolicyAction      = 'ALLOW' | 'DENY';
type ConditionValue    = string | Array<string>;
type ConditionOperator = 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in'
                       | 'in_condition_set' | 'contains' | 'starts_with' | 'ends_with';
type PolicyMethod      = 'eth_sendTransaction' | 'eth_signTransaction'
                       | 'eth_signUserOperation' | 'eth_signTypedData_v4' | 'personal_sign'
                       | 'eth_sign7702Authorization' | 'wallet_sendCalls' | /* ...solana, tron,
                          xrpl, earn_deposit, earn_withdraw, transfer... */ '*';
```

`[DOC]` Full `PolicyCondition` union also includes `EthereumCalldataCondition`,
`AggregationCondition`, `MessageSigningCondition`, `SystemCondition`, `ConditionSetItem`
(via `in_condition_set`). `AggregationCondition` is worth revisiting at G3 for velocity rules.

### 1.4 Endpoints and auth

| Operation | Call | Grade |
|---|---|---|
| Create policy | `POST /v1/policies` | `[DOC]` |
| Get policy | `GET /v1/policies/{policy_id}` | `[DOC]` |
| Update policy | `PATCH /v1/policies/{policy_id}` | `[DOC]` |
| **Append one rule** | `POST /v1/policies/{policy_id}/rules` | `[DOC]` |
| Delete rule | `DELETE /v1/policies/{policy_id}/rules/{rule_id}` | `[DOC]` |
| Create wallet | `POST /v1/wallets` body `{chain_type, policy_ids[]}` | `[DOC]` |
| Sign / send | `POST /v1/wallets/{wallet_id}/rpc` | `[DOC]` |
| Base URL | `https://api.privy.io` | `[SEARCH]` — verified on first live call |

`[DOC]` Auth: HTTP Basic (`PRIVY_APP_ID`:`PRIVY_APP_SECRET`) **plus** a `privy-app-id` header.

`[DOC]` Relevant headers:
- `privy-idempotency-key` — create only, dedupes within a 24h window
- `privy-authorization-signature` — comma-separated when multiple signatures required
- `privy-request-expiry` — Unix ms deadline

### 1.5 `[CORRECTION]` The brief's "version guard" does not exist

The brief states adding a rule is *"a read-modify-write with a version guard."*
Per `PolicyUpdateParams`, there is **no** ETag / version / concurrency-token parameter.
`version` is the literal `'1.0'` schema version, not an optimistic-concurrency token.

What actually exists:
- `PATCH /v1/policies/{id}` takes `rules?: Array<PolicyRuleRequestBody>` — a **whole-array
  replace**, so a naive read-modify-write genuinely can clobber a concurrent edit.
- `POST /v1/policies/{id}/rules` **appends a single rule**, sidestepping the race entirely.

⇒ **G5 must append via `POST .../rules`, not PATCH the full array.** Our safety comes from
append-semantics + `privy-authorization-signature`, not from a version guard. The brief's
read-modify-write instruction is superseded.

### 1.6 `[CORRECTION]` Field name is `to`, not `recipient`

Brief says key the DENY on the *recipient*. EIP-3009 `TransferWithAuthorization` names that
field **`to`**. Since `EthereumTypedDataMessageCondition.field` is a free-form `string`, the
rule must read `field: "to"`. The x402 substream separately calls it `recipient`. Confirms §2.1.

### 1.7 `[DOC]` Confirms the brief

- Max **1** policy per wallet (`policy_ids` documented "max 1"). ✓ brief
- Default-deny: unmatched request ⇒ DENY; `DENY` beats `ALLOW`. ✓ brief
  ⇒ an explicit ALLOW happy-path rule is mandatory before any DENY is meaningful.
- `owner_id` accepts a **key quorum ID** — this is the G5 quorum mechanism.

### 1.8 Still open

1. Base URL confirmation (first live call settles it).
2. Whether `field` supports dotted paths for nested structs. Irrelevant for EIP-3009
   (flat), may matter later.
3. Intent expiry (brief says 72h) — not yet seen in source.

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
