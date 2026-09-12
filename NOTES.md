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

> ⚠️ **Superseded by §4.1** — `docs.privy.io` is reachable again as of session 2. The text
> below described the session-1 block; the SDK-source approach it describes is still the
> preferred one, because the published source *is* the wire format, and the docs are now
> used to corroborate it rather than to replace it.

`docs.privy.io` and `privy.io` were **egress-blocked** in session 1. Resolved by
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

1. ~~Base URL confirmation~~ — **settled in §4.1**: `api.privy.io` answers, and Node's
   `fetch` reaches it. Only an authenticated call remains to prove the credentials.
2. Whether `field` supports dotted paths for nested structs. Irrelevant for EIP-3009
   (flat), may matter later.
3. Intent expiry (brief says 72h) — not yet seen in source. Revisit at G5.

---

## 2. x402 / EIP-3009 attribution

- `[PROMPT]` Agent **signs**, facilitator **broadcasts**. In Pinax's module
  `facilitator = trx.from`; the real payer is decoded from the authorization.
  - ⇒ Attribute spend by decoded `payer`, **never** `tx.from`.
  - ⇒ Enforce on `eth_signTypedData_v4`, **never** `eth_sendTransaction`.
- `[DOC]` (was `[PROMPT]`, **verified in §4.5/§4.6** against the real package)
  `x402-v0.1.0.spkg`, module `map_events` → `proto:evm.x402.v1.Events`.
  All 13 Payment fields confirmed verbatim. Note the nesting: `Payment` hangs off
  `Events.transactions[].logs[].payment`, not off the top level.
- `[DOC]` (was `[PROMPT]`) Pinax applies **no** facilitator filtering — stated verbatim in
  the package doc. That filtering is our contribution.

### 2.1 Naming collision to resolve before G1

The x402 event field is `recipient`. The EIP-712 `TransferWithAuthorization` field is `to`.
The Privy rule must key on whatever the **typed message** calls it (`to`), while the
ledger keys on what the **substream** calls it (`recipient`). Do not conflate.
Both spellings are now confirmed against their respective sources (§4.3, §4.6), so this is
settled: Privy rule ⇒ `to`; ledger column ⇒ `recipient`.

---

## 3. To verify before use

- `[PROMPT]` USDC on Base = `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
  (placed in `.env.example`; confirm on-chain before sending real funds in G2).
- `[PROMPT]` Agent0 / ERC-8004 subgraph deployed on Base — `github.com/agent0lab/subgraph`.

---

## 4. Session 2 (2026-09-12) — egress restored, shapes verified

### 4.1 `[DOC]` The egress block is GONE

Re-tested every host at session start. The previous session's blocker no longer applies.

| Host | Result |
|---|---|
| `api.privy.io` | **404 at `/`** — the API answering, not a proxy block |
| `docs.privy.io` | **200** |
| `thegraph.com`, `gateway.thegraph.com` | 200 |
| `mainnet.base.org` | 405 (RPC needs POST) |
| `pinax.network`, `bazantic.com` | 200 |

Node's built-in `fetch` reaches `api.privy.io` (405 on a GET to a POST-only route).
`NODE_USE_ENV_PROXY=1` is **not** required — plain `fetch` already traverses the proxy.

⚠️ The container is ephemeral: **`.env` did not survive** from the previous session.
Credentials must be re-supplied each new container. `.env` is correctly gitignored.

### 4.2 `[DOC]` GitHub API is repo-scoped; raw + release downloads are not

`api.github.com` returns 403 *"GitHub access to this repository is not enabled for this
session"* for any repo outside the session scope. But **`raw.githubusercontent.com` and
`github.com/.../releases/download/...` both work**. This is how the Pinax spkg and the Privy
SDK source were obtained. Use raw URLs, not the API, for third-party repos.

### 4.3 `[DOC]` Privy sign-typed-data wire format — script verified correct

From `privy-io/node-sdk` `src/resources/wallets/wallets.ts`:

```ts
interface EthereumSignTypedDataRpcInputParams { typed_data: EthereumTypedDataInput; }

interface EthereumTypedDataInput {
  domain: TypedDataDomainInputParams;   // = { [key: string]: unknown }  <- FREE-FORM
  message: { [key: string]: unknown };
  primary_type: string;                 // snake_case, NOT primaryType
  types: TypedDataTypesInputParams;     // = { [k: string]: TypedDataTypeFieldInput[] }
}

interface EthereumSignTypedDataRpcResponse {
  method: 'eth_signTypedData_v4';
  data: { encoding: 'hex'; signature: string };
}
```

Two spellings that were a live bug risk, now settled:
- The RPC param is **`typed_data`** and the key is **`primary_type`** (snake_case) —
  matching the policy-condition `TypedDataInput`, so the same casing is used in both places.
- `domain` is a **free-form passthrough map**, so the EIP-712 canonical camelCase
  (`chainId`, `verifyingContract`) is correct there and must NOT be snake_cased.

`POST /v1/policies/{id}/rules` body is **flat** `{name, method, conditions, action}` —
`privy-authorization-signature` / `privy-request-expiry` are lifted out as headers.

⇒ `scripts/g0a-signature-gate.mjs` matches the wire format on every call it makes.
No code change needed; it is blocked purely on credentials.

### 4.4 `[DOC]` Policy create — confirmed on docs.privy.io

`POST /v1/policies` requires `version:"1.0"`, `name` (1–50 chars), `chain_type`, `rules[]`.
Response carries the generated `id` (24-char) and `created_at` (ms).

### 4.5 `[DOC]` x402 spkg verified locally — ground truth #4 holds

`substreams` CLI **v1.16.6** installed. Package pulled from raw.githubusercontent.com
(568 KB) and inspected with `substreams info`:

```
Package name: x402   Version: v0.1.0   Network: mainnet
Name: map_events   Kind: map
Input:  source: sf.ethereum.type.v2.Block
Output Type: proto:evm.x402.v1.Events
Hash: 4aa30170e0d6f3b8ee5f58efce62dc55de751fda
```

The package doc says, verbatim:

> `map_events` does not apply facilitator filtering. It emits all onchain settlement
> candidates so stricter facilitator rules can be applied later in ClickHouse queries.

⇒ Confirms the brief: **facilitator filtering is ours to build.** It also names our G1
contribution precisely — Pinax defers the rule to a downstream query; we make it a
*composable module-level* allowlist, which is the reusable-module story for the Graph track.

Also confirmed: EIP-3009 settlements are reconstructed by joining `AuthorizationUsed`,
the matching ERC-20 `Transfer`, **and decoded `transferWithAuthorization` calldata when
traces are available** — which is exactly why `payer` is trustworthy and `tx.from` is not.

### 4.6 `[DOC]` `evm.x402.v1` schema — Payment is NESTED, not top-level

Read out of the package's FileDescriptorSet. The brief listed the `Payment` fields but not
the nesting, which changes how G1 must iterate:

```
Events
  └─ transactions[]  (Transaction)
       ├─ hash, from, index, nonce, gas_price, gas_limit, gas_used, value
       └─ logs[]     (Log)
            ├─ address, ordinal, topics, data, block_index
            ├─ call    (Call, optional — EXTENDED detail chains only)
            └─ payment (Payment, OPTIONAL)
```

`Payment` — all 13 brief-listed fields confirmed verbatim:
`asset, payer, recipient, facilitator, amount, nonce, transfer_method, settlement_source,
scheme, valid_after, valid_before, facilitator_allowlist_matched, confidence`
(`valid_after` / `valid_before` are `optional`; `amount` is a `uint256` string).

Enums confirmed:
- `TransferMethod`: `UNSPECIFIED | EIP3009 | PERMIT2`
- `SettlementSource`: `UNSPECIFIED | AUTHORIZATION_USED | PERMIT2_SETTLED |
  PERMIT2_SETTLED_WITH_PERMIT`
- `CallType`: `UNSPECIFIED | CALL | CALLCODE | DELEGATE | STATIC | CREATE`

⚠️ **`Transaction.from` is the facilitator** (ground truth #1) and sits one level ABOVE the
payment. `payment.payer` is the real spender. The nesting makes the bug the brief warns
about very easy to write by accident — the attribution join must reach *down* to
`payment.payer`, never reuse the enclosing `transaction.from`.

### 4.7 Open — `payment_id` needs a live row to settle

The brief specifies `payment_id = tx_hash:log_index`. The proto has **`Log.block_index`**
and **`Log.ordinal`**, but no field literally named `log_index`. Which one is the
receipt-level log index must be confirmed against a live G0b row before the G1 schema is
frozen. Do not guess — G1 says FREEZE THE SCHEMA, so this must be right first.

---

## 5. `[CORRECTION]` G1's "USD normalisation via token decimals" cannot use erc20-tokens

The brief's G1 says: *"composing x402 + erc20-tokens: ... USD normalisation via token
decimals."* **`erc20-tokens` does not carry `decimals`.** Verified, not assumed.

### 5.1 What erc20-tokens actually is

`substreams info` plus a read of the FileDescriptorSet shows `erc20-tokens-v0.4.0` defines
**66 message types**, every one a *protocol-specific admin/lifecycle event*:

- USDC: `Mint`, `Burn`, `Blacklisted`, `UnBlacklisted`, `BlacklisterChanged`,
  `MasterMinterChanged`, `MinterConfigured`, `MinterRemoved`, `PauserChanged`,
  `RescuerChanged`, **`AuthorizationUsed`**, **`AuthorizationCanceled`**
- USDT / WBTC / SAI / stETH / WETH: their own mint/burn/blacklist/rebase/deposit events

There is **no** `decimals`, no `symbol`, no `Approval`, and no plain ERC-20 `Transfer`
message. (The 27 raw `Transfer` byte-hits are `OwnershipTransferred` and
`StethTransferShares`.) Pinax's own README agrees, describing the module as
*"Protocol-specific events: WETH, USDC, USDT, WBTC, SAI, stETH"*.

### 5.2 `decimals` is in NO prebuilt Pinax package

Grepped the descriptor of every candidate. All zero occurrences of `decimals`:

| Package | Bytes | `decimals` |
|---|---|---|
| `erc20-tokens-v0.4.0` | 1.0 M | 0 |
| `erc20-transfers-v0.4.0` | 538 K | 0 |
| `erc20-balances-v0.3.0` | 866 K | 0 |
| `evm-contracts-v0.4.0` | 447 K | 0 |
| `evm-transfers-v0.5.0` | 1.9 M | 0 |

⇒ Token decimals must be sourced by us. It is **not** available for free from composition.

### 5.3 Resolution — and it is an asset, not a setback

`decimals()` is an immutable ERC-20 constant, so the correct live source is an **`eth_call`
per newly-seen asset, memoised in a Substreams store**. Pinax already establishes this exact
pattern in-repo: `erc20/balances` is documented as *"Token balances via batched RPC
`balanceOf` calls."* So RPC-from-module is idiomatic here, not a hack.

This is a *reusable composable module for an emerging standard* — precisely what The Graph's
Composable track asks for. It should be built as a standalone
`store_token_decimals` that any pipeline can import, not buried inside `papertrail`.

⚠️ Hardcoding `USDC = 6` is rejected: G6 requires the tooling work **against any fleet**, and
a hardcoded table fails the moment a fleet pays in a second asset.

### 5.4 `[DOC]` Prebuilt packages actually available (brief listed only 3)

Probed `spkg/` directly. Beyond the three the brief names:

```
evm-transfers-v0.4.0 / v0.5.0    evm-contracts-v0.4.0
erc20-transfers-v0.2.0 / v0.3.0 / v0.4.0
erc20-balances-v0.3.0            erc4626-v0.1.0
```

`erc4626-v0.1.0` is notable — The Graph's Composable prize explicitly names
*"ERC-4626 tokenized-vault flows"* as an in-scope emerging standard.

### 5.5 `[DOC]` `evm-transfers` db_out is the template for our `papertrail` db_out

```
Name: db_out   Kind: map
Input: params: hex
Input: source: sf.substreams.v1.Clock
Input: map: erc20_transfers:map_events
Input: map: erc20_tokens:map_events
Input: map: native_transfers:map_events
Output Type: proto:sf.substreams.sink.database.v1.DatabaseChanges
```

The imported `erc20_tokens:map_events` carries hash `0b74a28f59836022f1527553c19604b17db8fc41`
— **byte-identical to the standalone `erc20-tokens-v0.4.0`**, which proves import-based
composition reuses the exact module and is how we should wire `papertrail`.

Note this aggregator composes erc20_transfers + erc20_tokens + native_transfers and
**does NOT include the x402 package**. Pinax's README counts "ERC-3009 (x402) authorizations"
only because `erc20_tokens` emits USDC `AuthorizationUsed`. ⇒ **Composing `x402:map_events`
with `erc20_tokens:map_events` is genuinely novel**, and `papertrail` adds on top of it:
computed facilitator allowlist, payer-not-tx.from attribution, vendor first-seen.

### 5.6 `[DOC]` Base has EXTENDED detail level — the payer decode will work

Pinax's README lists Base among **Extended Blocks** chains, and the x402 package notes that
EIP-3009 settlements decode `transferWithAuthorization` calldata *"when traces are
available"*, with `Call` metadata *"available on chains with EXTENDED detail level:
Ethereum, Base, BSC, Polygon, ArbitrumOne, Optimism, Avalanche, TRON."*

⇒ On Base, the trace-dependent `payer` decode is available. This de-risks ground truth #1:
attribution by decoded `payer` is achievable on our target chain. Confirm on the first live
G0b row that `payer` is actually populated and not empty.

### 5.7 `[DOC]` Transaction shape confirms the misattribution trap

```protobuf
message Transaction {
  bytes hash = 1;  bytes from = 2;  optional bytes to = 3;  uint64 nonce = 5;
  string gas_price = 6; uint64 gas_limit = 7; uint64 gas_used = 8;
  string value = 9;  repeated Log logs = 10;
}
```

`Transaction.from` is the facilitator. `payment.payer` is two levels down. Never join on the
former. See §4.6.
