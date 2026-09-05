import { createPublicClient, http, formatUnits } from 'viem';
import { bscTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '@xpay/core';

const pc = createPublicClient({ chain: bscTestnet, transport: http(config.rpcUrl) });
const seller = privateKeyToAccount(process.env.SENTINEL_PK || process.env.XPAY_SELLER_KEY);
const UABI = { address: config.asset, abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] }] };
const [bnb, u] = await Promise.all([
  pc.getBalance({ address: seller.address }),
  pc.readContract({ address: config.asset, abi: UABI.abi, functionName: 'balanceOf', args: [seller.address] }),
]);
console.log('seller', seller.address);
console.log('BNB', formatUnits(bnb, 18), '(gas per tx ~0.0003)');
console.log('$U', formatUnits(u, config.decimals), '(cost per call', config.pricePerCallUsd + ')');
console.log('chain', config.chainId, 'asset', config.asset, 'rpc', config.rpcUrl);