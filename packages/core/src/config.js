import { privateKeyToAccount } from 'viem/accounts';
import { loadEnv } from './env.js';
loadEnv();

// Chain-parametrized x402 settlement config. Default = Base Sepolia USDC (verified fail-open,
// no faucet drama). Point CHAIN_ID/ASSET/RPC at BNB testnet ($U or USDT) for the Binance lane.
const CHAIN_ID = Number(process.env.XPAY_CHAIN_ID || 84532); // Base Sepolia default
const ASSET = process.env.XPAY_ASSET || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // USDC Base Sepolia
const DECIMALS = Number(process.env.XPAY_DECIMALS || 6);
const RPC_URL = process.env.XPAY_RPC_URL || 'https://base-sepolia.publicnode.com';
const PRICE_PER_CALL = Number(process.env.XPAY_PRICE_USDC || 0.02); // USDC per paid request
const MAX_TIMEOUT_S = Number(process.env.XPAY_TIMEOUT_S || 300);

const SELLER_KEY = process.env.XPAY_SELLER_KEY || process.env.SENTINEL_PK || '';
const SELLER_ACCOUNT = SELLER_KEY && SELLER_KEY.length >= 64 ? privateKeyToAccount(SELLER_KEY) : null;
const PAY_TO = (process.env.XPAY_PAY_TO ||
  (SELLER_ACCOUNT ? SELLER_ACCOUNT.address : '0x0000000000000000000000000000000000000000')
).toLowerCase();

export const config = {
  chainId: CHAIN_ID,
  network: `eip155:${CHAIN_ID}`,
  asset: ASSET.toLowerCase(),
  decimals: DECIMALS,
  rpcUrl: RPC_URL,
  pricePerCallUsd: PRICE_PER_CALL,
  amountAtomic: String(Math.round(PRICE_PER_CALL * 10 ** DECIMALS)),
  payTo: PAY_TO,
  maxTimeoutSeconds: MAX_TIMEOUT_S,
  sellerAccount: SELLER_ACCOUNT,
};