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

---

## 6. G0a RESULT — PASS. Privy enforces on an in-message field at signing time.

Run live against `api.privy.io` on 2026-09-12. Deterministic across repeat runs.

```
[3] Sign TransferWithAuthorization to 0x…dEaD          -> 200 SIGNED
[4] Append DENY on message.to == 0x…dEaD               -> rule created
[5] Sign the BYTE-IDENTICAL payload again              -> 400 REFUSED
[6] Sign to a DIFFERENT vendor, same wallet + policy   -> 200 SIGNED
```

Refusal shape:

```json
{"error":"RPC request denied due to policy violation","code":"policy_violation"}
```

⇒ **The mission's central mechanism is real.** A policy rule keyed on a field *inside* the
EIP-712 message refuses the signature, server-side, at the moment of signing. The agent
never gets a signature to hand to a facilitator, so there is nothing to broadcast.

⇒ **The README fallback (a pre-sign gate in our own x402 client) is NOT needed** and should
not be mentioned as the design. Enforcement is in Privy, not in our code — which is the
whole point, since our code is what an agent could route around.

### 6.1 Step 6 is load-bearing — do not remove it

Steps 1–5 alone **prove nothing**. A DENY that blocked *every* `eth_signTypedData_v4` would
produce an identical 1–5 transcript. Step 6 signs to a different recipient on the same
wallet under the same policy and requires SUCCESS, which is what establishes that the
refusal is keyed on `to` specifically rather than on the method.

It earned its keep immediately: it caught a false signal during development (§6.3).

### 6.2 `[CORRECTION]` Four API constraints the SDK types do not express

All four were discovered by live 400s. None appear in `policies.ts`.

| # | Constraint | Error |
|---|---|---|
| 1 | `eth_signTypedData_v4` rules **must have ≥1 condition** — `conditions: []` is rejected | `The 'eth_signTypedData_v4' method must have at least one condition` |
| 2 | `chainId` does **not** support operator `in` | `Operator 'in' is not supported for the 'chainId' field` |
| 3 | `chainId` value must be a **numerical string** — `'8453'`, not `'0x2105'`, not `8453` | `Condition value must be a numerical string` |
| 4 | Rule `name` must be **< 50 characters** — a bare `0x` address does not fit | `Rule name must be fewer than 50 characters` |

Constraint 1 has a design consequence: there is no such thing as a blanket "ALLOW all typed
data" happy path. Every ALLOW must be scoped. Ours is scoped to `chainId == 8453`, which is
more honest anyway. Constraint 4 means G3's generated rule names must be built from a
**truncated** address, never the full one.

### 6.3 `[DOC]` Privy validates addresses against their EIP-55 checksum

A mixed-case address in the typed message is validated as a checksummed address and rejected
**before the policy engine runs**:

```json
{"error":"Address \"0x…C0fe\" is invalid.\n\n- Address must be a hex value of 20 bytes (40 hex characters).\n- Address must match its checksum counterpart.","code":"invalid_data"}
```

This is why the assertions now check `code === 'policy_violation'` rather than just `!ok`.
A malformed payload and a policy refusal are both 400s, and conflating them would let the
kill test report a pass — or an inconclusive — for entirely the wrong reason.

⇒ Any address we synthesise into a payload must be **all-lowercase or correctly
checksummed**. All-lowercase is the safe default.

### 6.4 `[DOC]` Policy matching on addresses is CASE-INSENSITIVE — verified

This was a real fail-open risk worth proving rather than assuming: our substreams emits
**lowercase** addresses, so G3 will generate rules in lowercase, but an agent may sign a
**checksummed** payload. If matching were case-sensitive, every generated rule would
silently fail open.

Probe: DENY rule written with the lowercase form, then sign both casings.

```
rule value   : 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913  (lowercase)
sign lower   : 400 REFUSED
sign checksum: 400 REFUSED
```

⇒ **Case-insensitive. Safe.** A lowercase rule refuses a checksummed payload. No address
normalisation layer is required between the ledger and the policy writer. Re-verify if Privy
ever changes matching semantics.

### 6.5 Observed stored-policy shape (for G5 rule merging)

Privy returns rules with a server-assigned `id`, and preserves the submitted `value` string
verbatim (casing included) even though *matching* is case-insensitive:

```json
{"id":"ibbzhphgcey6fq786mscel84","name":"Block vendor 0x000000..00dEaD",
 "method":"eth_signTypedData_v4","action":"DENY",
 "conditions":[{"field_source":"ethereum_typed_data_message","field":"to",
   "typed_data":{"types":{"TransferWithAuthorization":[...]},
                 "primary_type":"TransferWithAuthorization"},
   "operator":"eq","value":"0x000000000000000000000000000000000000dEaD"}]}
```

Note the rule `id` — G5 can use `DELETE /v1/policies/{id}/rules/{rule_id}` to roll a rule
back, which is the "undo" path for a mistaken enforcement.

---

## 7. G0b RESULT — PASS. 12,351 live x402 payments from The Graph Market.

Run 2026-09-12 against Base mainnet via a Graph Market endpoint.

```
substreams run vendor/x402-v0.1.0.spkg map_events \
  -e base-mainnet.streamingfast.io:443 -s -10000 -t 0 -o jsonl
```

```
blocks processed : 6,180+   (51,221,476 .. 51,231,570)
payments         : 12,351
```

Non-zero by three orders of magnitude. No need for the fallback (widen window / try
Ethereum or Polygon).

### 7.1 `[CORRECTION]` The API key must be exchanged for a JWT

The brief implies `SUBSTREAMS_API_TOKEN` holds the key. It does not — a `server_`-prefixed
key is **rejected** by the endpoints:

```
base.substreams.pinax.network:443 -> unauthenticated: invalid access token
base-mainnet.streamingfast.io:443 -> invalid JWT token
```

The key must first be exchanged for a JWT:

```bash
curl -s -X POST https://auth.thegraph.market/v1/auth/issue \
  -H 'Content-Type: application/json' \
  -d "{\"api_key\":\"$SUBSTREAMS_API_KEY\"}" | jq -r .token
```

⇒ `.env` now separates **`SUBSTREAMS_API_KEY`** (the durable `server_` key) from
**`SUBSTREAMS_API_TOKEN`** (the short-lived JWT the CLI consumes). `scripts/substreams-auth.sh`
does the exchange.

The same key exchanges successfully at `auth.streamingfast.io` but is **rejected by
`auth.pinax.network`** (`api_key_not_found`), which identifies it as a **Graph Market**
key — the provider the prize rules require. Issued JWT is plan tier `FREE`.

`[DOC]` Base endpoints: `base-mainnet.streamingfast.io:443` (used) and
`base.substreams.pinax.network:443`.

### 7.2 GROUND TRUTH #1 CONFIRMED EMPIRICALLY — this is the project's whole case

| | count | share |
|---|---|---|
| **`payer` != `tx.from`** | **12,291** | **99.6 %** |
| `payer` == `tx.from` | 51 | 0.4 % |
| `payer` empty | **0** | 0 % |

In every inspected row `facilitator == tx.from` **exactly**, while `payer` is an unrelated
address. Example (block 51,221,476):

```
tx          0x0a8fe939c7a59b0be8a517d421ff68536bcbffadc06b4611aa524bea92ca6bfd
tx.from     0xb87e1a2cc2b4643f2892768e80e41167f17c5860   <- facilitator, NOT the spender
facilitator 0xb87e1a2cc2b4643f2892768e80e41167f17c5860   <- identical to tx.from
payer       0x8000dce4a82e68053326c1f2853d00081084efeb   <- the real spender
recipient   0x9fb365e4e9385e2a39febad70368267e6f571d9a
amount      50000  (0.05 USDC)
```

⇒ Attributing spend by `tx.from` would misattribute **99.6 % of all x402 payments on Base**
to whichever facilitator relayed them. This is not an edge case; it is the overwhelming
default, and it is the reason this project exists. Quote this number in the README and the
video.

### 7.3 `[DOC]` `payer` is never empty — the trace decode works on Base

0 of 12,351 payments had an empty `payer`. This confirms the §5.6 prediction: Base's EXTENDED
detail level makes `transferWithAuthorization` calldata available, so the decode that makes
`payer` trustworthy is reliable here. `call` metadata is present on the log objects.

### 7.4 `[DOC]` Ground truth #3 verified on-chain — USDC on Base

`0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` accounts for **12,341 / 12,351** payments and
appears as `tx.to`. Upgraded from `[PROMPT]` to observed. One other asset appeared once:
`0x3fda9cc61b1fef8b2ffd715f0a9eef7182e48f37`.

⇒ Two distinct assets in a single 5.5-hour window, which is exactly why hardcoding
`USDC = 6` decimals (§5.3) is the wrong call.

### 7.5 `[DOC]` 418 distinct facilitators — R4 has real signal

418 distinct facilitator addresses in ~5.5 hours, with a long tail: the top five each relayed
~521 payments, and the distribution falls away sharply. A computed allowlist is clearly
necessary, and R4 (unknown facilitator) will fire on real data rather than only on planted
data.

### 7.6 ⚠️ Every payment is `confidence: "heuristic"`

All 12,351 rows carry `confidence: "heuristic"`, `transferMethod: TRANSFER_METHOD_EIP3009`,
`settlementSource: SETTLEMENT_SOURCE_AUTHORIZATION_USED`.

`confidence` is a **string**, not a number. And nothing observed is "exact" — the EIP-3009
reconstruction is a join of `AuthorizationUsed` + `Transfer` + calldata, and Pinax labels the
result heuristic.

⇒ Be precise in the write-up: we report *reconstructed* payments, not settled-and-proven
ones. Carry `confidence` through to the `payments` table and surface it in G6 rather than
silently dropping it — claiming certainty the upstream module does not is the kind of thing
a judge will catch.

### 7.7 `[RESOLVED]` §4.7 — `payment_id` uniqueness settled with live data

Both candidate keys are unique across all 12,351 payments — zero collisions:

| Candidate | Unique? | Distinct |
|---|---|---|
| `(block, log.blockIndex)` | **YES** | 12,351 |
| `(tx_hash, log.ordinal)` | **YES** | 12,351 |

`log.blockIndex` is the receipt-level log index within the block — the field the brief calls
`log_index`. `ordinal` is a Firehose execution-order counter, unique but **not** the index a
block explorer shows.

⇒ **Freeze `payment_id = tx_hash:blockIndex` at G1.** Both are unique, but `blockIndex`
is the value a reader can verify against an explorer, and G6 requires every answer to cite
transaction hashes that a judge can actually check. Do not use `ordinal` for the public id.

### 7.8 Independent replication

`scripts/g0b-liveness.sh` re-ran the measurement over a different, later window and
reproduced the headline figure exactly:

| Run | Blocks | Payments | `payer != tx.from` | payment_id collisions |
|---|---|---|---|---|
| Initial (10k window) | 6,180+ | 12,351 | 12,291 (**99.6 %**) | 0 |
| Verify script (2k window) | 1,229 | 2,247 | 2,237 (**99.6 %**) | 0 |

The 10k run completed cleanly: exit 0, 10,145 blocks processed, 22 GiB scanned, 9.6 MiB
egress. The 99.6 % figure is stable across windows, so it is safe to quote.

---

## 8. Environment constraints discovered while wiring G1

### 8.1 `[DOC]` This container's egress is **port 443 only**

Not a credentials problem and not provider-specific. Measured directly — the *same host*
answers on 443 and times out on the Postgres ports:

```
aws-0-us-east-1.pooler.supabase.com:443   -> OPEN
aws-0-us-east-1.pooler.supabase.com:5432  -> TimeoutError
aws-0-us-east-1.pooler.supabase.com:6543  -> TimeoutError
github.com:22                             -> TimeoutError   (control)
github.com:443                            -> OPEN           (control)
```

⇒ **No external Postgres is reachable from this container, from any provider.**
`substreams-sink-sql` speaks the native Postgres wire protocol on 5432, so it cannot reach a
hosted database from here. This is an environment property, not something to fix in code.

Consequences:
- **G1 runs against the local Postgres.** Its exit criterion (`select count(*), sum(amount_usd)
  from payments` over live Base rows) is fully satisfiable locally, so this does not block or
  weaken the gate — the *data* is live, which is what the Graph tracks require. Only the
  storage location is local.
- For anything that must persist to demo day, run the sink from a machine with unrestricted
  egress, using `SUPABASE_DATABASE_URL`.

### 8.2 `[DOC]` Supabase direct hosts are IPv6-only

`db.<ref>.supabase.co` has **no A record** — `socket.gethostbyname` fails with
"No address associated with hostname", while `https://<ref>.supabase.co` resolves fine. This
container has no global IPv6 address, so the direct host is unusable regardless of §8.1.

The IPv4 path is the Supavisor pooler, `aws-0-<region>.pooler.supabase.com`, with the username
form `postgres.<project-ref>`. Those hosts resolve over IPv4 — but are still blocked by §8.1,
so the pooler does not rescue this container either.

⇒ When taking the URI from the Supabase dashboard, copy the **pooler / "Connection pooling"**
URI, not the direct one, on any IPv4-only network.

### 8.3 Passwords in connection URIs must be percent-encoded

A password containing `@` (or `:` `/` `?` `#`) breaks URI parsing — the `@` is read as the
host separator. `Khushal@1855` must be written `Khushal%401855`. Generated automatically in
`.env`; worth remembering when pasting a URI from any dashboard.

### 8.4 Local Postgres needs an explicit start, and TCP is localhost-only

The server ships installed but **stopped**, and `service postgresql start` is required after
every container start. `listen_addresses = localhost`, so connect over `127.0.0.1` — the unix
socket path fails with peer authentication unless running as the `postgres` OS user.
`scripts/db-up.sh` does the whole dance idempotently.
