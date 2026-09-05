const puppeteer = require('puppeteer');
const fs = require('fs');
const { execFile } = require('child_process');
const CHROME = '/home/ubuntu/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome';
const URL = 'https://xpay-commerce.onrender.com';
const t0 = Date.now();
const tl = [];
const mark = (phase) => tl.push({ phase, t: +((Date.now() - t0) / 1000).toFixed(2) });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: false,
    args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-default-browser-check','--window-position=0,0','--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1) Landing + live market (real prices/sparklines)
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.bringToFront();
  await sleep(7000);
  mark('landing_hero');
  await page.evaluate(() => window.scrollBy(0, 420)); await sleep(1500);
  mark('live_market');

  // 2) Market request studio + real 402 paywall
  await page.click('.land-nav a[href="#/market"]').catch(()=>{});
  await page.waitForSelector('.view-title', { timeout: 8000 }).catch(()=>{});
  await sleep(2000); mark('market_studio');
  await page.click('#mkt-demo402').catch(()=>{});
  await sleep(3200); mark('paywall_402');

  // 3) LEDGER — fire a REAL on-chain $U paid call and watch it land live
  await page.evaluate(()=>{ location.hash = '#/ledger'; });
  await page.waitForSelector('#led-tbody', { timeout: 8000 }).catch(()=>{});
  await sleep(1500);
  // snapshot the ledger via the API (full hashes), NOT the short form shown in the DOM
  const startHashes = await (async () => {
    try { const r = await fetch(URL + '/ledger', { signal: AbortSignal.timeout(8000) }); const j = await r.json(); return (j.payments || []).map(p => p.tx_hash); }
    catch (e) { return []; }
  })();
  const startRows = await page.evaluate(() => document.querySelectorAll('#led-tbody tr').length);

  const buyerKey = fs.readFileSync('.demo-buyer-key', 'utf8').trim();
  const buyProc = new Promise((resolve) => {
    execFile('node', ['--dns-result-order=ipv4first','apps/buyer/src/buy.js', URL+'/v1/market/BTCUSDT', 'BTCUSDT'],
      { cwd: process.cwd(), env: { ...process.env, XPAY_ENV_FILE: '.env.bnb', XPAY_BUYER_KEY: buyerKey }, timeout: 90000 },
      (err, stdout, stderr) => resolve({ err, stdout, stderr }));
  });
  mark('payment_fired');
  // poll /ledger for a NEW hash not present at start (compare FULL hashes)
  let landed = null;
  const pollUntil = Date.now() + 46000;
  while (Date.now() < pollUntil) {
    try {
      const r = await fetch(URL + '/ledger', { signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      const hashes = (j.payments || []).map(p => p.tx_hash);
      const fresh = hashes.filter(h => !startHashes.includes(h));
      if (fresh.length) { landed = fresh[0]; break; }
    } catch (e) {}
    await sleep(2000);
  }
  if (landed) {
    mark('payment_tx_' + landed.slice(2, 10));
    // wait for the UI ledger (5s poll) to show the new row -> row count increases
    const uiAt = Date.now() + 10000;
    while (Date.now() < uiAt) {
      const rows = await page.evaluate(() => document.querySelectorAll('#led-tbody tr').length);
      if (rows > startRows) break;
      await sleep(1200);
    }
    await sleep(5000);
    mark('ledger_live');
  } else {
    const bp = await buyProc;
    mark('payment_' + (bp.err ? 'error' : 'timeout'));
    await sleep(2500);
  }
  mark('ledger');

  // 4) MCP tools
  await page.evaluate(()=>{ location.hash = '#/mcp'; });
  await page.waitForSelector('td.mono', { timeout: 8000 }).catch(()=>{});
  await sleep(3200); mark('mcp_tools');

  // 5) Closure
  await page.evaluate(()=>{ location.hash = '#/'; });
  await page.waitForSelector('.hero h1', { timeout: 8000 }).catch(()=>{});
  await sleep(3000); mark('closure');
  await sleep(26000);

  fs.writeFileSync('timeline.json', JSON.stringify(tl, null, 2));
  console.log('TIMELINE_DONE', JSON.stringify(tl));
  await browser.close();
})().catch(e => { console.error('DRIVER_ERR', e.message); try{ fs.writeFileSync('timeline.json', JSON.stringify(tl)); }catch(_){} process.exit(1); });