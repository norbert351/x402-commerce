// HTTP/SSE MCP transport for xPay Commerce — mounts the same paid x402 tools
// the stdio server exposes, over SSE so remote agents (Claude, Cursor, etc.) can
// reach the commerce endpoint over HTTP without a local stdio subprocess.
//
// GET  /mcp                -> establish SSE session (event: endpoint -> POST url)
// POST /mcp?sessionId=...  -> send a JSON-RPC message to that session
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { config, verifyPayments, createLedger } from '@xpay/core';
import { registerTools } from '@xpay/core/mcp-tools.js';

const ledger = createLedger(new URL('../../asp/data/ledger.sqlite', import.meta.url).pathname);
function bankTxId(txHash) {
  if (ledger.alreadyBanked(txHash)) throw { code: 'payment_already_used', detail: 'tx already consumed' };
  return true;
}

function newMcpServer() {
  const server = new McpServer({ name: 'xpay-commerce', version: '0.1.0' });
  registerTools(server, { ledger, verify: verifyPayments, bankTxId });
  return server;
}

// Sessions keyed by sessionId; one transport per connected agent.
const sessions = new Map();

// handleMcpRequest(req, res) — returns true if it handled an /mcp request.
export async function handleMcpRequest(req, res, url) {
  if (url.pathname !== '/mcp') return false;

  if (req.method === 'GET') {
    const transport = new SSEServerTransport('/mcp', res);
    const server = newMcpServer();
    try {
      await server.connect(transport); // connect() auto-starts the SSE transport
      // Track the session lazily; prune stale ones (transport closed) on the next GET.
      sessions.set(transport.sessionId, { transport, server });
    } catch (err) {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'mcp_connect_failed', detail: err.message }));
    }
    return true;
  }

  if (req.method === 'POST') {
    // Prune sessions whose SSE connection already closed (transport.res destroyed).
    for (const [sid, s] of sessions) {
      if (s.transport.res && s.transport.res.writableEnded) sessions.delete(sid);
    }
    const sessionId = url.searchParams.get('sessionId');
    const sock = sessions.get(sessionId);
    if (!sock) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unknown_session', sessionId }));
      return true;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try { await sock.transport.handlePostMessage(req, res, body); }
      catch (err) {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'mcp_message_failed', detail: err.message }));
      }
    });
    return true;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'method_not_allowed' }));
  return true;
}