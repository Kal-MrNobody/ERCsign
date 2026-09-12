#!/usr/bin/env node
/**
 * G0a — KILL TEST: does Privy refuse a signature based on a field INSIDE the typed message?
 *
 * Sequence:
 *   1. Create a policy that ALLOWs eth_signTypedData_v4 (default-deny needs a happy path).
 *   2. Create a wallet bound to that policy.
 *   3. Sign an EIP-3009 TransferWithAuthorization to VENDOR_X   -> expect SUCCESS.
 *   4. Append a DENY rule keyed on the message's `to` field == VENDOR_X.
 *   5. Sign the byte-identical payload again                     -> expect REFUSED.
 *
 * PASS == step 5 is refused by Privy. Anything else is a FAIL and we do not proceed.
 *
 * Every request shape here is taken from privy-io/node-sdk source. See NOTES.md §1.
 */

const BASE = process.env.PRIVY_API_BASE ?? 'https://api.privy.io';
const APP_ID = process.env.PRIVY_APP_ID;
const APP_SECRET = process.env.PRIVY_APP_SECRET;

if (!APP_ID || !APP_SECRET) {
  console.error('FAIL: set PRIVY_APP_ID and PRIVY_APP_SECRET (see .env.example)');
  process.exit(2);
}

// A vendor address we will later blocklist. Override to re-run against a fresh one.
const VENDOR_X = process.env.G0A_VENDOR ?? '0x000000000000000000000000000000000000dEaD';
const USDC_BASE = process.env.USDC_BASE ?? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_CHAIN_ID = 8453;

// EIP-3009. Field order is normative - it defines the struct hash.
const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};
const PRIMARY_TYPE = 'TransferWithAuthorization';

const auth = 'Basic ' + Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64');

async function privy(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: auth,
      'privy-app-id': APP_ID,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
}

function authorization(to) {
  const now = Math.floor(Date.now() / 1000);
  return {
    domain: {
      name: 'USD Coin',
      version: '2',
      chainId: BASE_CHAIN_ID,
      verifyingContract: USDC_BASE,
    },
    types: EIP3009_TYPES,
    primary_type: PRIMARY_TYPE,
    message: {
      from: '0x0000000000000000000000000000000000000001', // replaced with wallet address
      to,
      value: '10000',                                      // 0.01 USDC, 6 decimals
      validAfter: '0',
      validBefore: String(now + 3600),
      nonce: '0x' + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'),
    },
  };
}

const sign = (walletId, typed_data) =>
  privy('POST', `/v1/wallets/${walletId}/rpc`, {
    method: 'eth_signTypedData_v4',
    params: { typed_data },
  });

async function main() {
  const step = (n, msg) => console.log(`\n[${n}] ${msg}`);

  // ---- 1. policy with an explicit ALLOW happy path -------------------------
  step(1, 'Creating policy with ALLOW for eth_signTypedData_v4');
  const pol = await privy('POST', '/v1/policies', {
    version: '1.0',
    name: 'RedFlag_Trail G0a kill test',
    chain_type: 'ethereum',
    rules: [
      {
        name: 'Allow EIP-3009 authorizations',
        method: 'eth_signTypedData_v4',
        conditions: [],
        action: 'ALLOW',
      },
    ],
  }, { 'privy-idempotency-key': `g0a-${Date.now()}` });

  if (!pol.ok) {
    console.error('FAIL: could not create policy', pol.status, JSON.stringify(pol.json));
    if (pol.status === 404) console.error('HINT: PRIVY_API_BASE may be wrong (NOTES.md §1.4)');
    process.exit(1);
  }
  const policyId = pol.json.id;
  console.log('    policy_id =', policyId);

  // ---- 2. wallet bound to it ----------------------------------------------
  step(2, 'Creating wallet bound to policy');
  const w = await privy('POST', '/v1/wallets', {
    chain_type: 'ethereum',
    policy_ids: [policyId],
  });
  if (!w.ok) {
    console.error('FAIL: could not create wallet', w.status, JSON.stringify(w.json));
    process.exit(1);
  }
  const walletId = w.json.id;
  console.log('    wallet_id =', walletId, 'address =', w.json.address);

  // ---- 3. baseline signature: must SUCCEED --------------------------------
  step(3, `Signing authorization to ${VENDOR_X} (expect SUCCESS)`);
  const payload = authorization(VENDOR_X);
  payload.message.from = w.json.address;
  const before = await sign(walletId, payload);
  console.log('    ->', before.status, before.ok ? 'SIGNED' : 'REFUSED');
  if (!before.ok) {
    console.error('FAIL: baseline signature was refused. The ALLOW path is wrong.');
    console.error(JSON.stringify(before.json, null, 2));
    process.exit(1);
  }

  // ---- 4. append the DENY keyed on the in-message `to` field ---------------
  step(4, `Appending DENY rule on message.to == ${VENDOR_X}`);
  const rule = await privy('POST', `/v1/policies/${policyId}/rules`, {
    name: `Block vendor ${VENDOR_X}`,
    method: 'eth_signTypedData_v4',
    conditions: [
      {
        field_source: 'ethereum_typed_data_message',
        field: 'to',
        operator: 'eq',
        value: VENDOR_X,
        typed_data: { primary_type: PRIMARY_TYPE, types: EIP3009_TYPES },
      },
    ],
    action: 'DENY',
  });
  if (!rule.ok) {
    console.error('FAIL: could not append DENY rule', rule.status, JSON.stringify(rule.json));
    process.exit(1);
  }
  console.log('    rule_id =', rule.json.id ?? '(none returned)');

  // ---- 5. identical payload: must be REFUSED ------------------------------
  step(5, 'Re-signing the identical authorization (expect REFUSED)');
  const after = await sign(walletId, payload);
  console.log('    ->', after.status, after.ok ? 'SIGNED' : 'REFUSED');

  console.log('\n' + '='.repeat(60));
  if (!after.ok) {
    console.log('G0a PASS — Privy refused the signature on an in-message field.');
    console.log('Enforcement lives in Privy at signing time. Fallback NOT needed.');
    console.log('Refusal:', JSON.stringify(after.json));
    process.exit(0);
  }
  console.log('G0a FAIL — signature still succeeded after the DENY rule.');
  console.log('Do NOT proceed. Re-read NOTES.md §1.2 before changing anything.');
  process.exit(1);
}

main().catch((e) => { console.error('FAIL: unexpected', e); process.exit(1); });
