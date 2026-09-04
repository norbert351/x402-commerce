import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

// MCP server over stdio — newline-delimited JSON-RPC. Verify the tool surface and
// the unsigned payment_required path (no wallet). Paid path lives in client.mjs e2e.
async function initServer() {
  const child = spawn('node', ['--dns-result-order=ipv4first', new URL('../src/server.js', import.meta.url).pathname], {
    cwd: new URL('..', import.meta.url).pathname,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let acc = '';
  let queue = [];
  let waiting = null;
  child.stdout.on('data', (d) => {
    acc += d.toString();
    let i;
    while ((i = acc.indexOf('\n')) >= 0) {
      const line = acc.slice(0, i).trim();
      acc = acc.slice(i + 1);
      if (!line) continue;
      const obj = JSON.parse(line);
      if (waiting) { const w = waiting; waiting = null; w(obj); }
      else queue.push(obj);
    }
  });
  const send = (o) => child.stdin.write(JSON.stringify(o) + '\n');
  const recv = () => queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => { waiting = r; });
  await new Promise((r) => child.stdin.write('', r));
  return { child, send, recv };
}

async function handshake(mcp) {
  mcp.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
  await mcp.recv();
  mcp.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
}

test('MCP server lists get_market_data tool over stdio', async () => {
  const mcp = await initServer();
  try {
    await handshake(mcp);
    mcp.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const res = await mcp.recv();
    const names = res.result.tools.map((t) => t.name);
    assert.ok(names.includes('get_market_data'));
    assert.ok(names.includes('get_quote'));
    assert.ok(names.includes('get_klines'));
    assert.equal(res.id, 2);
  } finally { mcp.child.kill(); }
});

test('MCP get_market_data unsigned returns payment_required', async () => {
  const mcp = await initServer();
  try {
    await handshake(mcp);
    mcp.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_market_data', arguments: { symbol: 'BTCUSDT' } } });
    const res = await mcp.recv();
    const j = JSON.parse(res.result.content[0].text);
    assert.equal(j.status, 'payment_required');
    assert.equal(j.resource, '/v1/market/BTCUSDT');
    assert.equal(j.payTo, process.env.XPAY_PAY_TO?.toLowerCase() || j.payTo);
  } finally { mcp.child.kill(); }
});