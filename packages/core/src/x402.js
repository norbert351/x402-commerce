import { config } from './config.js';

export const EIP712_DOMAIN = { name: 'x402', version: '2', chainId: config.chainId };
export const EIP712_TYPES = {
  Payment: [
    { name: 'scheme', type: 'string' },
    { name: 'network', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'asset', type: 'address' },
    { name: 'amount', type: 'string' },
    { name: 'payTo', type: 'address' },
    { name: 'maxTimeoutSeconds', type: 'uint256' },
    { name: 'description', type: 'string' },
    { name: 'extra', type: 'string' },
  ],
};

// The accepted entry the buyer signs. Every field is bound into the signed message,
// so underpayment / redirect-to-wrong-asset / overlong-timeout are all rejected at sign time.
// `override` lets a PUBLISHED feed (storefront) set its own price / payTo; unset fields fall
// back to the global config so the default path is byte-for-byte unchanged.
export function acceptedEntry(resource, description, override) {
  override = override || {};
  return {
    scheme: 'exact',
    network: config.network,
    chainId: config.chainId,
    asset: config.asset,
    amount: String(override.amountAtomic || config.amountAtomic),
    payTo: (override.payTo || config.payTo).toLowerCase(),
    maxTimeoutSeconds: config.maxTimeoutSeconds,
    description,
    extra: JSON.stringify({ name: tokenLabel(), version: '2' }), // MUST be a string; label tracks the settle asset
  };
}

function tokenLabel() {
  return config.chainId === 97 ? 'United Stables ($U)' : 'USDC';
}

export function toPaymentMessage(accepted) {
  return {
    scheme: 'exact',
    network: `eip155:${accepted.chainId}`,
    chainId: BigInt(accepted.chainId),
    asset: accepted.asset,
    amount: String(accepted.amount),
    payTo: accepted.payTo,
    maxTimeoutSeconds: BigInt(accepted.maxTimeoutSeconds),
    description: accepted.description || '',
    extra: typeof accepted.extra === 'string' ? accepted.extra : JSON.stringify(accepted.extra || {}),
  };
}

// Build the b64 challenge sent in the PAYMENT-REQUIRED header on a 402 response.
// `override` (optional) = published-feed pricing {amountAtomic, payTo}.
export function buildChallengeBytes(resource, description, override) {
  const challenge = { x402Version: 2, error: 'Payment required', accepts: [acceptedEntry(resource, description, override)], resource };
  return Buffer.from(JSON.stringify(challenge)).toString('base64');
}

// Build the b64 PAYMENT-SIGNATURE header the buyer replays after settling on-chain.
export function buildReplayBytes({ accepted, signature, payer }) {
  return Buffer.from(JSON.stringify({ accepted, signature, payer })).toString('base64');
}

// Decode a b64 PAYMENT-SIGNATURE header back into its parts.
export function decodeReplayBytes(headerB64) {
  const { accepted, signature, payer } = JSON.parse(Buffer.from(headerB64, 'base64').toString());
  return { accepted, signature, payer };
}