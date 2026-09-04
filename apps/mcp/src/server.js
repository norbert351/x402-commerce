import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config, buildChallengeBytes, verifyPayments, createLedger } from '@xpay/core';
import { registerTools } from '@xpay/core/mcp-tools.js';

// xPay Commerce — MCP binding (stdio transport).
// The Binance feed exposed as x402-priced MCP tools. Same gate as the REST ASP,
// same ledger (replay + budget + audit) — the MCP surface IS the commerce.
// Shared with the HTTP/SSE MCP endpoint via packages/core/mcp-tools.js.

const ledger = createLedger(new URL('../../asp/data/ledger.sqlite', import.meta.url).pathname);

function bankTxId(txHash) {
  if (ledger.alreadyBanked(txHash)) throw { code: 'payment_already_used', detail: 'tx already consumed' };
  return true;
}

const server = new McpServer({ name: 'xpay-commerce', version: '0.1.0' });
registerTools(server, { ledger, verify: verifyPayments, bankTxId });

// Connect over stdio (agents add this server via their MCP client config).
const transport = new StdioServerTransport();
await server.connect(transport);