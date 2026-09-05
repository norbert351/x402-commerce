const puppeteer = require('puppeteer');
const fs = require('fs');
const CHROME = '/home/ubuntu/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome';
const URL = 'https://xpay-commerce.onrender.com';
const t0 = Date.now();
const tl = [];
const mark = (phase) => tl.push({ phase, t: +( (Date.now() - t0) / 1000 ).toFixed(2) });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: false,
    args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-default-browser-check','--window-position=0,0','--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1) Landing — let the live market panel build sparkline history
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.bringToFront();
  await sleep(9000);
  mark('landing_hero');

  // 2) Reveal the live market feed (real prices + sparklines)
  await page.evaluate(() => window.scrollBy(0, 420)); await sleep(1800);
  mark('live_market');

  // 3) Into the product — Market page
  await sleep(600);
  await page.click('.land-nav a[href="#/market"]');
  await page.waitForSelector('.view-title', { timeout: 8000 }).catch(()=>{});
  await sleep(2500); mark('market_request_studio');

  // 4) Show the real paywall — fires the paid call, catches the 402 challenge
  await page.click('#mkt-demo402');
  await sleep(3200); mark('paywall_402_challenge');

  // 5) Ledger — the on-chain audit trail + spend budget
  await page.click('.nav-item[data-route="/ledger"], .bn-item[data-route="/ledger"]').catch(async()=>{
    // on product pages sidebar visible; fall back to land nav if needed
    await page.evaluate(()=>{ location.hash = '#/ledger'; });
  });
  await page.waitForSelector('.view-title', { timeout: 8000 }).catch(()=>{});
  await sleep(3200); mark('ledger');

  // 6) MCP — the 3 paid tools + SSE endpoint
  await page.click('.nav-item[data-route="/mcp"]').catch(async()=>{ await page.evaluate(()=>{ location.hash='#/mcp'; }); });
  await page.waitForSelector('td.mono', { timeout: 8000 }).catch(()=>{});
  await sleep(3200); mark('mcp_tools');

  // 7) Closure — back to landing, long dwell so the fixed -t capture doesn't cut black
  await page.evaluate(()=>{ location.hash = '#/'; });
  await page.waitForSelector('.hero h1', { timeout: 8000 }).catch(()=>{});
  await sleep(4000); mark('closure');
  await sleep(26000); // total dwell so recording tail is clean

  fs.writeFileSync('timeline.json', JSON.stringify(tl, null, 2));
  console.log('TIMELINE_DONE', JSON.stringify(tl));
  await browser.close();
})().catch(e => { console.error('DRIVER_ERR', e.message); try{ fs.writeFileSync('timeline.json', JSON.stringify(tl)); }catch(_){} process.exit(1); });