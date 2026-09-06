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
    args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-default-browser-check','--window-position=0,0','--window-size=1440,900','--disable-extensions','--disable-background-networking','--disable-sync','--disable-component-update','--js-flags=--max-old-space-size=512']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  /* Retrying executor — an SPA hash-route re-render can detach the frame mid-op,
     which throws "Attempted to use detached Frame". Retry instead of aborting. */
  async function safe(fn, label) {
    let tries = 8;
    while (tries--) {
      try { return await fn(); }
      catch (e) {
        if (/detached Frame/i.test(e.message)) { await sleep(250); continue; }
        throw e;
      }
    }
    throw new Error('gave up on ' + label);
  }
  const safeEval = (fn) => safe(() => page.evaluate(fn), 'eval');
  const safeClick = (sel) => safe(async () => { await page.waitForSelector(sel, { timeout: 8000 }).catch(()=>{}); await page.click(sel); }, 'click ' + sel);
  const safeSelect = (sel, val) => safe(() => page.select(sel, val), 'select ' + sel);
  const rowsCount = () => safeEval(() => document.querySelectorAll('#led-tbody tr').length);
  const storeRows = () => safeEval(() => Array.from(document.querySelectorAll('#sf-tbody tr')).map(r => r.innerText));

  // 1) LANDING + live market (real prices/sparklines)
  try { await page.goto(URL, { waitUntil: 'networkidle2', timeout: 45000 }); } catch(e) { /* networkidle may time out on app-heavy page; continue anyway */ }
  await page.bringToFront();
  await sleep(8000); mark('landing');
  await safeEval(() => window.scrollBy(0, 430)); await sleep(1700); mark('live_market');

  // 2) MARKET — request studio, real typing + selects + clicks
  await safeEval(() => { location.hash = '#/market'; });
  await sleep(800); mark('market_studio');
  await safeClick('#mkt-sym');
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.keyboard.type('ETHUSDT', { delay: 40 });
  await safeSelect('#mkt-res', 'ticker');
  await safeEval(() => { const e = document.querySelector('#mkt-sym'); e && e.dispatchEvent(new Event('change')); });
  await sleep(2300); mark('market_inputs');
  await safeClick('#mkt-unlock');
  await sleep(3400); mark('paywall_unlock');
  await safeClick('#mkt-demo402');
  await sleep(2800); mark('paywall_demo');

  // 3) LEDGER — fire a REAL $U paid call and watch it land live
  await safeEval(() => { location.hash = '#/ledger'; });
  await sleep(2000);
  const startHashes = await (async () => {
    try { const r = await fetch(URL + '/ledger', { signal: AbortSignal.timeout(8000) }); const j = await r.json(); return (j.payments || []).map(p => p.tx_hash); }
    catch (e) { return []; }
  })();
  const startRows = await rowsCount();
  try {
    const buyerKey = fs.readFileSync('.demo-buyer-key', 'utf8').trim();
    const buyProc = new Promise((resolve) => {
      execFile('node', ['--dns-result-order=ipv4first','apps/buyer/src/buy.js', URL+'/v1/market/BTCUSDT', 'BTCUSDT'],
        { cwd: process.cwd(), env: { ...process.env, XPAY_ENV_FILE: '.env.bnb', XPAY_BUYER_KEY: buyerKey }, timeout: 90000 },
        (err, stdout) => resolve({ err }));
    });
    mark('payment_fired');
    let landed = null, pollUntil = Date.now() + 50000;
    while (Date.now() < pollUntil) {
      try { const r = await fetch(URL + '/ledger', { signal: AbortSignal.timeout(8000) }); const j = await r.json();
        const fresh = (j.payments||[]).map(p=>p.tx_hash).filter(h=>!startHashes.includes(h));
        if (fresh.length) { landed = fresh[0]; break; } } catch (e) {}
      await sleep(2000);
    }
    if (landed) {
      mark('payment_tx_' + landed.slice(2,10));
      const uiAt = Date.now() + 12000;
      while (Date.now() < uiAt) { const rows = await rowsCount(); if (rows > startRows) break; await sleep(1200); }
      await sleep(6000); mark('ledger_live');
    } else { const bp = await buyProc; mark('payment_'+(bp.err?'error':'timeout')); await sleep(2500); }
  } catch (e) { mark('payment_error'); }
  await sleep(3000); mark('ledger_overview'); await safeEval(() => window.scrollBy(0, 240)); await sleep(1800); mark('ledger_budget');

  // 4) MCP — the 3 paid tools + config
  await safeEval(() => { location.hash = '#/mcp'; });
  await sleep(1800); mark('mcp_tools');
  await safeEval(() => window.scrollBy(0, 220)); await sleep(1600); mark('mcp_config');

  // 5) STOREFRONT — SELL-SIDE: publish a REAL feed live
  await safeEval(() => { location.hash = '#/publish'; });
  await sleep(1300); mark('storefront_form');
  await safeClick('#sf-sym');
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.keyboard.type('XRPUSDT', { delay: 45 });
  await safeSelect('#sf-type', 'klines');
  await safeEval(() => { const e = document.querySelector('#sf-price'); if (e) { e.value = '0.00004'; e.dispatchEvent(new Event('change')); } });
  await sleep(800); mark('storefront_inputs');
  await safeClick('#sf-create');
  await sleep(1600);
  let sfVisible = false, sfUntil = Date.now() + 10000;
  while (Date.now() < sfUntil) {
    try { if ((await storeRows()).some(t => t.includes('XRPUSDT'))) { sfVisible = true; break; } } catch (e) {}
    await sleep(1200);
  }
  if (sfVisible) { mark('storefront_published'); await safeEval(() => window.scrollBy(0, 220)); await sleep(3000); mark('storefront_list'); }
  else { mark('storefront_noop'); await sleep(2000); }

  // 6) CLOSURE
  await safeEval(() => { location.hash = '#/'; });
  await sleep(2500); mark('closure');
  await sleep(15000);

  fs.writeFileSync('timeline.json', JSON.stringify(tl, null, 2));
  console.log('TIMELINE_DONE', JSON.stringify(tl));
  await browser.close();
})().catch(e => { console.error('DRIVER_ERR', e.message); try{ fs.writeFileSync('timeline.json', JSON.stringify(tl)); }catch(_){} process.exit(1); });