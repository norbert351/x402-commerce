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

  // 1) LANDING + live market (real prices/sparklines)
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.bringToFront();
  await sleep(7500); mark('landing');
  await page.evaluate(() => window.scrollBy(0, 430)); await sleep(1600); mark('live_market');

  // 2) MARKET — request studio, real typing + selects + clicks
  await page.evaluate(() => { location.hash = '#/market'; });
  await page.waitForSelector('#mkt-sym', { timeout: 8000 }).catch(()=>{});
  await sleep(600); mark('market_studio');

  // type a custom symbol + pick a resource with real input/select
  await page.click('#mkt-sym');
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.keyboard.type('ETHUSDT', { delay: 40 });
  await page.select('#mkt-res', 'ticker');
  await page.evaluate(() => { const e = document.querySelector('#mkt-sym'); e.dispatchEvent(new Event('change')); });
  await sleep(2200); mark('market_inputs');

  // click Unlock live data -> catches the real 402 challenge
  await page.click('#mkt-unlock');
  await sleep(3400); mark('paywall_unlock');

  // click Show paywall (demo 402) -> decoded challenge
  await page.evaluate(() => { location.hash = '#/market'; }); // ensure result area visible (already there)
  await page.click('#mkt-demo402');
  await sleep(2800); mark('paywall_demo');

  // 3) LEDGER — fire a REAL $U paid call and watch it land live
  await page.evaluate(() => { location.hash = '#/ledger'; });
  await page.waitForSelector('#led-tbody', { timeout: 8000 }).catch(()=>{});
  await sleep(1800);
  const startHashes = await (async () => {
    try { const r = await fetch(URL + '/ledger', { signal: AbortSignal.timeout(8000) }); const j = await r.json(); return (j.payments || []).map(p => p.tx_hash); }
    catch (e) { return []; }
  })();
  const startRows = await page.evaluate(() => document.querySelectorAll('#led-tbody tr').length);
  const buyerKey = fs.readFileSync('.demo-buyer-key', 'utf8').trim();
  const buyProc = new Promise((resolve) => {
    execFile('node', ['--dns-result-order=ipv4first','apps/buyer/src/buy.js', URL+'/v1/market/BTCUSDT', 'BTCUSDT'],
      { cwd: process.cwd(), env: { ...process.env, XPAY_ENV_FILE: '.env.bnb', XPAY_BUYER_KEY: buyerKey }, timeout: 90000 },
      (err, stdout, stderr) => resolve({ err, stdout }));
  });
  mark('payment_fired');
  let landed = null, pollUntil = Date.now() + 46000;
  while (Date.now() < pollUntil) {
    try { const r = await fetch(URL + '/ledger', { signal: AbortSignal.timeout(8000) }); const j = await r.json();
      const fresh = (j.payments||[]).map(p=>p.tx_hash).filter(h=>!startHashes.includes(h));
      if (fresh.length) { landed = fresh[0]; break; } } catch (e) {}
    await sleep(2000);
  }
  if (landed) {
    mark('payment_tx_' + landed.slice(2,10));
    const uiAt = Date.now() + 10000;
    while (Date.now() < uiAt) { const rows = await page.evaluate(()=>document.querySelectorAll('#led-tbody tr').length); if (rows > startRows) break; await sleep(1200); }
    await sleep(5500); mark('ledger_live');
  } else { const bp = await buyProc; mark('payment_'+(bp.err?'error':'timeout')); await sleep(2500); }
  // dwell on spend overview + budget + payments table (already on-screen)
  await sleep(3000); mark('ledger_overview');

  // 4) MCP — the 3 paid tools + config
  await page.evaluate(()=>{ location.hash = '#/mcp'; });
  await page.waitForSelector('td.mono', { timeout: 8000 }).catch(()=>{});
  await sleep(1500); mark('mcp_tools');
  await page.evaluate(() => window.scrollBy(0, 220)); await sleep(1500); mark('mcp_config');

  // 5) Closure
  await page.evaluate(()=>{ location.hash = '#/'; });
  await page.waitForSelector('.hero h1', { timeout: 8000 }).catch(()=>{});
  await sleep(3000); mark('closure');
  await sleep(22000);

  fs.writeFileSync('timeline.json', JSON.stringify(tl, null, 2));
  console.log('TIMELINE_DONE', JSON.stringify(tl));
  await browser.close();
})().catch(e => { console.error('DRIVER_ERR', e.message); try{ fs.writeFileSync('timeline.json', JSON.stringify(tl)); }catch(_){} process.exit(1); });