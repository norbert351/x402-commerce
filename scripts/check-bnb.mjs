import { createPublicClient, http } from 'viem';
const pc = createPublicClient({ transport: http('https://bsc-testnet-rpc.publicnode.com'), chain: { id: 97, name: 'bsctestnet' } });
const wallet = '0x73b16058d57a6337060677496d4A8e97A9554539';
const U = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const fa = '0x86e9197CC0F76E4e4aaa7082180945196bBAb5D3';
const balance = await pc.getBalance({ address: wallet });
const balAbi = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address', name: 'a' }], outputs: [{ type: 'uint256' }] }];
const ubal = await pc.readContract({ address: U, abi: balAbi, functionName: 'balanceOf', args: [wallet] });
let allowed = null;
try { allowed = await pc.readContract({ address: fa, abi: [{ type: 'function', name: 'allowedToWithdraw', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] }], functionName: 'allowedToWithdraw', args: [wallet] }); } catch (e) { allowed = `err:${e.shortMessage?.slice(0,40)||e.message?.slice(0,40)}`; }
console.log('BNB balance:', Number(balance) / 1e18);
console.log('$U balance :', Number(ubal) / 1e18);
console.log('faucet allowedToWithdraw:', allowed);