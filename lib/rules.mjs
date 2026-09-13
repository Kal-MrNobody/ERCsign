// Risk rules, and the Privy policy rule each one proposes.
//
// The proposed_rule is NOT a description of what should happen - it is the
// exact JSON body POSTed to /v1/policies/{id}/rules. A human approves the thing
// that actually gets enforced, with no translation step in between where
// meaning could drift.
//
// Shape confirmed in G0a against the live API (NOTES.md 1.2, 6.2):
//   - field_source 'ethereum_typed_data_message' reads a field INSIDE the
//     EIP-712 message, which is what makes signing-time enforcement possible
//   - the EIP-3009 recipient field is named `to`, not `recipient`
//   - rule names are capped at 50 chars, so addresses must be truncated
//   - matching is case-insensitive, verified, so lowercase values are safe

export const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

const short = (addr) => `${addr.slice(0, 8)}..${addr.slice(-6)}`;

/** DENY any EIP-3009 authorization whose in-message `to` is this vendor. */
export function denyVendorRule(vendor, reason) {
  const name = `Block ${short(vendor)}`;                 // <= 50 chars by construction
  return {
    name,
    method: 'eth_signTypedData_v4',
    action: 'DENY',
    conditions: [
      {
        field_source: 'ethereum_typed_data_message',
        field: 'to',
        operator: 'eq',
        value: vendor.toLowerCase(),
        typed_data: { primary_type: 'TransferWithAuthorization', types: EIP3009_TYPES },
      },
    ],
    _reason: reason,   // carried for the console; stripped before POSTing
  };
}

export const RULES = {
  // R1 - the vendor is absent from the ERC-8004 / Agent0 registry entirely.
  R1: {
    id: 'R1',
    title: 'Unregistered vendor',
    severity: 'high',
    describe: (v, f) =>
      `${v} is not registered in the ERC-8004 registry but received ` +
      `${f.payment_count} payment(s) totalling ${f.exposure_usd ?? '?'} USD.`,
  },
  // R2 - the vendor is new AND we are the majority of everything it has ever
  // received. A vendor that exists only to receive our money.
  R2: {
    id: 'R2',
    title: 'Fresh vendor, we are >50% of its lifetime receipts',
    severity: 'high',
    describe: (v, f) =>
      `${v} was first seen recently and our fleet accounts for ` +
      `${f.share_pct}% of its lifetime receipts across ${f.payment_count} payment(s).`,
  },
  // R4 - the relaying facilitator is outside the computed allowlist.
  R4: {
    id: 'R4',
    title: 'Unknown facilitator',
    severity: 'medium',
    describe: (v, f) =>
      `Facilitator ${v} relayed ${f.payment_count} of our payment(s) but sits ` +
      `outside the computed allowlist (below the activity floor).`,
  },
};

/** Stable id so re-running the engine updates a finding rather than duplicating it. */
export const findingId = (rule, subject) => `${rule}:${subject.toLowerCase()}`;
