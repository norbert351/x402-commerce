/* xPay Commerce — single-page dashboard (vanilla, no framework, IIFE, non-module).
   Served from /public by the ASP node:http server. All API calls go to BASE
   (= window.location.origin so it works same-origin when deployed AND locally;
   overridable with ?base=https://host:port). */
(function () {
  "use strict";

  /* ---------------- config ---------------- */
  const params = new URLSearchParams(window.location.search);
  var baseOverride = (params.get("base") || "").trim().replace(/\/+$/, "");
  var BASE = baseOverride || window.location.origin;

  var SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
  var PREVIEW_POLL_MS = 5000;
  var LEDGER_POLL_MS = 5000;
  var meta = { chainId: null, decimals: 6, priceUsdc: 0.02 };

  /* ---------------- dom helpers ---------------- */
  var viewRoot = document.getElementById("view-root");
  var toastWrap = document.getElementById("toast-wrap");

  function $(sel, root) { return (root || document).querySelector(sel); }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------------- toast ---------------- */
  function toast(msg, type) {
    var t = el("div", "toast " + (type || ""));
    var icon = (type === "success") ? "✓" : (type === "error") ? "⨯" : (type === "warn") ? "!" : "ℹ";
    t.innerHTML = '<span class="t-ico">' + icon + "</span><span>" + msg + "</span>";
    toastWrap.appendChild(t);
    setTimeout(function () { t.style.opacity = "0"; t.style.transition = "opacity .35s"; }, 3200);
    setTimeout(function () { t.remove(); }, 3650);
  }

  /* ---------------- clipboard ---------------- */
  function copyText(text, label) {
    var done = function () { toast("Copied " + (label || "value"), "success"); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed", "error"); }
      ta.remove();
    }
  }

  /* ---------------- fetch ---------------- */
  function api(path, opts) {
    opts = opts || {};
    return fetch(BASE + path, {
      method: opts.method || "GET",
      headers: opts.headers || {},
      body: opts.body || undefined,
      signal: opts.signal || AbortSignal.timeout(15000),
    }).then(function (r) {
      return { status: r.status, ok: r.ok, headers: r.headers, text: r.text.bind(r) };
    }).then(function (res) {
      return res.text().then(function (body) {
        var json = null;
        try { json = body ? JSON.parse(body) : null; } catch (e) { json = null; }
        return { status: res.status, ok: res.ok, headers: res.headers, json: json, raw: body };
      });
    });
  }

  function getJSON(path) { return api(path).then(function (r) { return r.json; }); }

  /* ---------------- format helpers ---------------- */
  function fmtNum(v) {
    if (v === null || v === undefined || v === "") return "—";
    var n = Number(v);
    if (Number.isNaN(n)) return String(v);
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  function fmtUsd(v) {
    var n = Number(v);
    if (Number.isNaN(n)) return "—";
    if (n >= 1000) return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return "$" + n.toFixed(n < 1 ? 4 : 2);
  }

  // atomic -> human, e.g. 20000 @ 6 dec = 0.02
  function humanAtomic(atomic, decimals) {
    var n = Number(atomic);
    if (Number.isNaN(n)) return "—";
    var d = decimals == null ? meta.decimals : decimals;
    var h = n / Math.pow(10, d);
    return (h === 0 ? "0" : h.toLocaleString(undefined, { maximumFractionDigits: d })) + " " + (meta.assetShort || meta.chainShort || "$U");
  }

  function assetName() {
    if (meta.chainId === 97) return "$U";
    if (meta.chainId === 84532) return "USDC";
    return "token";
  }
  meta.assetShort = assetName();

  function shortAddr(a) {
    if (!a) return "—";
    return a.slice(0, 6) + "…" + a.slice(-4);
  }

  function relTime(ms) {
    if (!ms) return "—";
    var s = Math.floor((Date.now() - ms) / 1000);
    if (s < 5) return "just now";
    if (s < 60) return s + "s ago";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    var d = Math.floor(h / 24);
    return d + "d ago";
  }

  function utcTime(ms) {
    if (!ms) return "—";
    return new Date(ms).toISOString().replace("T", " ").replace(/.000Z$/, " UTC");
  }

  function chainLabel() {
    if (meta.chainId === 97) return "BSC testnet · $U";
    if (meta.chainId === 84532) return "Base Sepolia · USDC";
    if (meta.chainId) return "Chain " + meta.chainId;
    return "—";
  }

  function budgetHuman(v) {
    if (v === null || v === undefined) return "uncapped";
    return humanAtomic(String(v), meta.decimals);
  }

  function normSymbol(s) {
    return String(s || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  }

  function pctClass(p) { return Number(p) >= 0 ? "up" : "down"; }
  function pctArrow(p) { return Number(p) >= 0 ? "▲" : "▼"; }

  /* ---------------- global error banner ---------------- */
  var gb = document.getElementById("global-banner");
  var gbText = document.getElementById("global-banner-text");
  var gbErr = false;
  function setGlobalError(msg, kind) {
    gb.classList.remove("hidden");
    gbText.textContent = msg;
    if (kind === "error") { gb.classList.add("err"); gb.classList.remove("info"); }
    else { gb.classList.add("info"); gb.classList.remove("err"); }
    gbErr = true;
    if (kind === "error") {
      var dot = document.getElementById("conn-dot-side");
      dot.classList.add("down"); dot.classList.remove("up");
      document.getElementById("conn-text-side").textContent = "API unreachable";
    }
  }
  function clearGlobalError() {
    gb.classList.add("hidden");
    gbErr = false;
    var dot = document.getElementById("conn-dot-side");
    dot.classList.add("up"); dot.classList.remove("down");
    document.getElementById("conn-text-side").textContent = "connected";
  }
  function handleApiFail(err, silent) {
    var msg = (err && err.message === "The operation was aborted due to timeout")
      ? "Request timed out (" + BASE + ")"
      : (err && err.message) || "Network error";
    if (!silent) toast(msg, "error");
    setGlobalError("Backend unreachable at " + BASE + " — " + msg + ". Showing graceful empty states.", "error");
  }
  document.getElementById("global-banner-close").addEventListener("click", clearGlobalError);

  document.getElementById("base-chip").textContent = BASE.replace(/^https?:\/\//, "");

  /* =========================================================
     ROUTER
     ========================================================= */
  var routes = {
    "/": renderDashboard,
    "/market": renderMarket,
    "/ledger": renderLedger,
    "/publish": renderPublish,
    "/mcp": renderMcp,
  };

  function currentRoute() {
    var h = (location.hash || "#/").replace(/^#/, "") || "/";
    return routes[h] ? h : "/";
  }

  function navigate() {
    var route = currentRoute();
    var fns = routes[route] || routes["/"];
    document.body.classList.toggle("on-landing", route === "/");
    document.querySelectorAll(".nav-item, .bn-item").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-route") === route);
    });
    fns();
  }

  window.addEventListener("hashchange", navigate);

  /* =========================================================
     HEALTH / META (shared)
     ========================================================= */
  function refreshMeta() {
    return api("/health").then(function (r) {
      if (r.ok && r.json) {
        var h = r.json;
        meta.chainId = Number(h.chainId);
        meta.decimals = h.decimals != null ? Number(h.decimals) : meta.decimals;
        meta.priceUsdc = Number(h.priceUsdc) || meta.priceUsdc;
        meta.payTo = h.payTo;
        meta.amountAtomic = h.amountAtomic;
        meta.budgetAtomic = h.budgetAtomic;
        meta.assetShort = assetName();
        meta.chainShort = meta.chainId === 97 ? "$U" : meta.chainId === 84532 ? "USDC" : "token";
        clearGlobalError();
        return h;
      }
      throw new Error(r.raw && r.raw.slice(0, 90));
    }).catch(function (e) {
      handleApiFail(e, true);
      return null;
    });
  }

  /* =========================================================
     DASHBOARD
     ========================================================= */
  var pairHistory = {}; // symbol -> array of {t, price}
  var pairChg = {};     // symbol -> 24h change percent (from preview)
  var dashHealthTimer = null;
  var dashPreviewTimer = null;

  function renderDashboard() {
    var root = viewRoot;
    root.innerHTML = "";

    /* ---- landing header (own nav on the homepage) ---- */
    var head = el("header", "land-header");
    head.innerHTML =
      '<a class="land-brand" href="#/">' +
        '<span class="land-mark"><img class="mark-img" src="logo.png" alt="" width="30" height="30" /></span>' +
        '<span class="land-name">xPay<span>Commerce</span></span>' +
      '</a>' +
      '<nav class="land-nav"><a href="#/market">Market</a><a href="#/ledger">Ledger</a><a href="#/mcp">MCP</a></nav>' +
      '<a class="btn btn-primary land-cta" href="#/market">Unlock live data <span class="arrow">→</span></a>';
    root.appendChild(head);

    /* ---- hero ---- */
    var hero = el("section", "hero");
    hero.innerHTML =
      '<span class="hero-eyebrow"><span class="d"></span>&nbsp;x402 · Open Payments v2</span>' +
      '<h1>Agents pay per call.<br><span class="grad">No subscriptions. No API keys.</span></h1>' +
      '<p class="hero-sub">An AI agent settles an on-chain <b>micro-payment</b> through the <b>Open Payments x402</b> protocol to unlock live Binance market data — every call changes the ledger. One transfer, one request, billed atomically.</p>' +
      '<div class="hero-cta">' +
        '<a class="btn btn-primary btn-lg" href="#/market">Unlock live data <span class="arrow">→</span></a>' +
        '<a class="btn btn-ghost btn-lg" href="#/ledger">Open the ledger</a>' +
      '</div>' +
      '<div class="hero-trust">' +
        '<span class="pill teal">x402 · Payment Required</span>' +
        '<span class="pill green">pay-per-call</span>' +
        '<span class="pill muted">Binance Agent OS</span>' +
      '</div>';
    root.appendChild(hero);

    /* ---- LIVE market panel: the real-time image that matches the product ---- */
    var live = el("section", "live-panel");
    live.innerHTML =
      '<div class="panel-head">' +
        '<span class="ph-l"><span class="live-dot"></span> Live market feed</span>' +
        '<span class="ph-r">free preview · refreshes every 5s</span>' +
      '</div>' +
      '<div class="live-grid">' +
        SYMBOLS.map(function (s) {
          return '<div class="tk" id="row-' + s + '"><div class="tk-skel"></div></div>';
        }).join("") +
      '</div>';
    root.appendChild(live);

    /* ---- system chips (from /health) ---- */
    var chips = el("div", "chips");
    chips.innerHTML =
      '<div class="chip"><span class="c-l">price / call</span><span class="c-v" id="chip-price">…</span></div>' +
      '<div class="chip"><span class="c-l">chain · asset</span><span class="c-v" id="chip-chain">…</span></div>' +
      '<div class="chip"><span class="c-l">paid calls</span><span class="c-v" id="chip-paid">0</span></div>' +
      '<div class="chip"><span class="c-l">budget</span><span class="c-v" id="chip-budget">…</span></div>';
    root.appendChild(chips);

    /* ---- how it works ---- */
    var how = el("section", "how");
    how.innerHTML =
      '<h2 class="sec-h">How the pay-per-call rail works</h2>' +
      '<p class="sec-sub">No subscriptions, no shared API keys — just a per-request on-chain micro-payment.</p>' +
      '<div class="step-grid">' +
        '<div class="step"><div class="st-num">01</div><div class="st-title">Agent calls the feed</div><div class="st-desc">A buyer agent requests live market data with no proof of payment yet.</div></div>' +
        '<div class="step"><div class="st-num">02</div><div class="st-title">Paywall answers 402</div><div class="st-desc">The server returns <b>HTTP 402</b> with an x402 challenge encoding resource, payee and amount.</div></div>' +
        '<div class="step"><div class="st-num">03</div><div class="st-title">One transfer = one request</div><div class="st-desc">The agent settles on-chain, signs the EIP-712 payment and replays with a <span class="st-sig">PAYMENT-SIGNATURE</span> header to unlock the billed payload.</div></div>' +
      '</div>';
    root.appendChild(how);

    /* ---- protocol / trust ---- */
    var trust = el("section", "trust-band");
    trust.innerHTML =
      '<div class="tb-l"><h2 class="sec-h">Built for agents,<br>audited like a ledger</h2></div>' +
      '<div class="tb-r"><ul class="chk">' +
        '<li>Every call leaves an <b>immutable on-chain ledger entry</b> — tx hash, payer, resource, amount.</li>' +
        '<li><b>Replay protection</b>: a paid transaction can only be consumed once. No double-spend rows.</li>' +
        '<li><b>Per-payer daily budget</b> caps exposure at a spend limit you set — never an unlimited draw.</li>' +
      '</ul></div>';
    root.appendChild(trust);

    /* ---- CTA band ---- */
    var band = el("section", "cta-band");
    band.innerHTML =
      '<h2>Try the live rail</h2>' +
      '<p>Kick the paywall, hit the demo 402, or wire the buyer CLI and settle a real on-chain micro-payment.</p>' +
      '<div class="hero-cta">' +
        '<a class="btn btn-primary btn-lg" href="#/market">Into the product <span class="arrow">→</span></a>' +
        '<a class="btn btn-ghost btn-lg" href="#/mcp">MCP tools for agents</a>' +
      '</div>';
    root.appendChild(band);

    /* ---- footer ---- */
    var foot = el("footer", "land-foot");
    foot.innerHTML = "xPay Commerce · Binance Agent OS · Open Payments x402";
    root.appendChild(foot);

    /* kick off live data */
    refreshMeta().then(function (h) { renderHealth(document.createElement("div"), h); });
    loadPreviews();
    renderLandingTickers();
    setTimeout(renderLandingTickers, 1500); // draw a line after the first previews land
    if (dashPreviewTimer === null) {
      dashPreviewTimer = setInterval(pollLanding, PREVIEW_POLL_MS);
    }
  }

  /* refetch previews, then re-render the landing tickers once data lands */
  function pollLanding() {
    loadPreviews().then(function () { renderLandingTickers(); });
  }

  /* live landing tickers: real price + 24h change + sparkline per symbol */
  function renderLandingTickers() {
    SYMBOLS.forEach(function (sym) {
      var row = document.getElementById("row-" + sym);
      if (!row) return;
      var arr = (pairHistory[sym] || []).map(function (p) { return Number(p.price); });
      if (!arr.length) return;
      var last = arr[arr.length - 1];
      var chg = pairChg[sym];
      var chgN = chg != null ? Number(chg) : 0;
      var cls = chgN >= 0 ? "up" : "down";
      var pk = cls === "up" ? "spk-up" : "spk-down";
      var W = 132, H = 38, pad = 4;
      var mn = Math.min.apply(null, arr), mx = Math.max.apply(null, arr), rng = (mx - mn) || 1;
      function x(i) { return pad + i * ((W - pad * 2) / (arr.length - 1)); }
      function y(v) { return pad + (H - pad * 2) * (1 - (v - mn) / rng); }
      var pts = arr.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); }).join(" ");
      var area = pad + "," + (H - pad) + " " + pts + " " + (W - pad).toFixed(1) + "," + (H - pad);
      var svg = '<svg class="' + pk + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
        '<polygon points="' + area + '" opacity="0.14"/>' +
        '<polyline points="' + pts + '" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
        '</svg>';
      row.innerHTML =
        '<div class="tk-sym">' + esc(sym) + '</div>' +
        '<div class="tk-price">' + fmtNum(last) + '</div>' +
        '<div class="tk-chg ' + cls + '">' + pctArrow(chg) + (chg != null ? " " + Number(chg).toFixed(2) : " —") + "%</div>" +
        '<div class="tk-spark">' + svg + '</div>';
    });
  }

  function cardHead(title, hint) {
    var wrap = el("div", "card-head");
    wrap.appendChild(el("div", "card-title", esc(title)));
    if (hint) wrap.appendChild(el("span", "card-hint", esc(hint)));
    return wrap;
  }

  function renderHealth(box, h) {
    if (!h) {
      box.innerHTML = '<div class="stat"><div class="stat-label">ok</div><div class="stat-value" style="color:var(--danger)">offline</div></div>' +
        '<div class="stat"><div class="stat-label">chain</div><div class="stat-value">—</div></div>' +
        '<div class="stat"><div class="stat-label">price / call</div><div class="stat-value">—</div></div>' +
        '<div class="stat"><div class="stat-label">callers paid</div><div class="stat-value">—</div></div>';
      return;
    }
    var paid = (h.ledger && typeof h.ledger.payments === "number") ? h.ledger.payments : 0;
    var ip = el("div");
    ip.innerHTML =
      '<div class="stat"><div class="stat-label">ok</div><div class="stat-value" style="color:var(--green)">online</div>' +
      '<div class="small muted mt">' + esc(h.product || "xPay Commerce") + '</div></div>' +
      '<div class="stat"><div class="stat-label">chain · asset</div><div class="stat-value" style="font-size:15px">' + esc(chainLabel()) + '</div>' +
      '<div class="small muted mt">' + esc(meta.network || h.network || "eip155") + '</div></div>' +
      '<div class="stat"><div class="stat-label">price / call</div><div class="stat-value">' + fmtUsd(h.priceUsdc) + '</div>' +
      '<div class="small muted mt">' + humanAtomic(h.amountAtomic, meta.decimals) + '</div></div>' +
      '<div class="stat"><div class="stat-label">paid calls (ledger)</div><div class="stat-value">' + paid + '</div>' +
      '<div class="small muted mt">budget: ' + esc(budgetHuman(h.budgetAtomic)) + '</div></div>';
    var nodes = Array.from(ip.childNodes);
    box.replaceChildren.apply(box, nodes);
    // landing float-chips (lazy — only when the dashboard is live)
    var setChip = function (id, val) { var n = document.getElementById(id); if (n) n.textContent = String(val); };
    setChip("chip-price", h.amountAtomic != null ? humanAtomic(h.amountAtomic, meta.decimals) + " / call" : fmtUsd(h.priceUsdc) + " / call");
    setChip("chip-chain", chainLabel());
    setChip("chip-paid", paid);
    setChip("chip-budget", budgetHuman(h.budgetAtomic));
    // pay-to copy row (wrapped + copyable)
    var pt = document.getElementById("payto-card");
    if (h.payTo && pt) {
      pt.querySelector(".cr-val").textContent = h.payTo;
      var btn = pt.querySelector(".copy-btn");
      if (btn) btn.setAttribute("data-clip", h.payTo);
    }
  }

  function freeVsPaidCard() {
    var c = el("div", "card");
    c.appendChild(cardHead("Free preview vs paid feed", "2s-fresh teaser vs per-call depth"));
    var ul = el("ul", "bullets");
    ul.innerHTML = escapeUls(
      '<li>Free preview = <b>2s-fresh teaser</b> — just enough to entice, no payment.</li>' +
      '<li>Full feed (<b>ticker, klines, depth</b>) unlocks <b>per-call for a few cents</b> — pay for what you consume.</li>' +
      '<li>Removal of the x402 gate = the <b>paywall disappears = it is no longer pay-per-call</b>. The protocol is the product.</li>'
    );
    c.appendChild(ul);
    return c;
  }

  function loadBearingCard() {
    var c = el("div", "card");
    c.appendChild(cardHead("Making the protocol load-bearing", "x402 isn’t a wrapper"));
    var p = el("div", "card mt");
    p.innerHTML = '<div class="small muted">' +
      '<p style="margin-bottom:10px">The <b>x402 Payment channel</b> carries a signed EIP-712 challenge (resource + payee + amount). A replay ring at the ASP <b>consumes each tx once</b> and a <b>per-payer daily budget</b> caps exposure.</p>' +
      '<ul class="bullets">' +
      '<li><b>Challenge</b> → HTTP 402 with <span style="font-family:var(--mono);color:var(--accent)">PAYMENT-REQUIRED</span> header. No keys live in the UI — the buyer CLI settles on-chain with a funded wallet.</li>' +
      '<li><b>One transfer = one request</b> — replay protection means a paid tx can’t be replayed to drain the ledger.</li>' +
      '<li><b>Anything on-chain can charge</b> — the same gate serves agents over MCP and humans over REST.</li>' +
      '</ul></div>';
    c.appendChild(p);
    return c;
  }
  function escapeUls(s) {
    // bullets contain intentional markup; only escape the dynamic bits (already escaped upstream). Leave as-is.
    return s;
  }

  function renderPair(sym, data) {
    if (!data) return;
    var t = data.ticker || {};
    var last = t.lastPrice != null ? t.lastPrice : data.price;
    var chg = t.priceChangePercent;
    var cls = pctClass(chg);
    pairChg[sym] = chg;
    // ALWAYS feed history (even when no #pair-SYM box exists, e.g. on the landing)
    if (last != null) {
      if (!pairHistory[sym]) pairHistory[sym] = [];
      var arr = pairHistory[sym];
      var now = Date.now();
      if (!arr.length || Math.abs(now - (arr[arr.length - 1].t)) > 3000) {
        arr.push({ t: now, price: last });
        if (arr.length > 90) arr.shift();
      }
    }
    var box = document.getElementById("pair-" + sym);
    if (!box) return;
    box.innerHTML =
      '<div class="pair-top"><span class="pair-sym">' + esc(sym) + '</span>' +
      '<span class="pair-chg ' + cls + '">' + pctArrow(chg) + ' ' + (chg != null ? Number(chg).toFixed(2) : "—") + '%</span></div>' +
      '<div class="pair-price">' + fmtNum(last) + '</div>' +
      '<div class="pair-meta"><span>H ' + fmtNum(t.highPrice) + '</span><span>L ' + fmtNum(t.lowPrice) + '</span></div>';
  }

  function loadPreviews() {
    return Promise.all(SYMBOLS.map(function (sym) {
      return api("/v1/preview/" + sym).then(function (r) {
        if (r.ok && r.json) renderPair(sym, r.json);
      }).catch(function () { /* leave existing or skeleton */ });
    }));
  }

  function startPreviewPoll() {
    if (dashPreviewTimer === null) dashPreviewTimer = setInterval(loadPreviews, PREVIEW_POLL_MS);
  }

  /* =========================================================
     MARKET
     ========================================================= */
  var mkt = { symbol: "BTCUSDT", resource: "spot" };
  var mktPreviewTimer = null;

  function renderMarket() {
    var root = viewRoot;
    root.innerHTML = "";

    var head = el("div", "view-head");
    head.appendChild(el("div", "view-eyebrow", "Paid market feed"));
    head.appendChild(el("h1", "view-title", "Unlock live data per-call"));
    head.appendChild(el("p", "view-desc", "The full Binance feed is gated behind an on-chain x402 micro-payment. Free preview first — then run the buyer CLI to settle, and the paywall opens for that call."));
    root.appendChild(head);

    // controls
    var controls = el("div", "card");
    controls.appendChild(cardHead("Request studio", "choose a resource + symbol"));
    var fieldRow = el("div", "field-row");
    fieldRow.innerHTML =
      '<div class="field"><label>Symbol</label><input class="input" id="mkt-sym" value="' + esc(mkt.symbol) + '" spellcheck="false" placeholder="BTCUSDT"></div>' +
      '<div class="field" style="flex-grow:1"><label>Resource</label><select class="input" id="mkt-res">' +
      '<option value="spot">Spot price · /v1/market/:sym</option>' +
      '<option value="ticker">24h ticker · /v1/market/:sym/ticker</option>' +
      '<option value="klines">Candles · /v1/market/:sym/klines</option></select></div>' +
      '<div class="field" style="flex-basis:120px"><label>Interval</label><select class="input" id="mkt-int">' +
      '<option>1m</option><option>5m</option><option>15m</option><option selected>1h</option><option>4h</option><option>1d</option></select></div>';
    var actions = el("div", "field-row mt16");
    actions.innerHTML =
      '<button class="btn btn-primary" id="mkt-unlock"><span class="spin dark hidden" id="mkt-unlock-spin"></span> Unlock live data</button>' +
      '<button class="btn btn-warn" id="mkt-demo402">Show paywall (demo 402)</button>';
    fieldRow.appendChild(actions);
    controls.appendChild(fieldRow);
    controls.appendChild(el("div", "small muted mt16", "“Unlock live data” fires the paid resource with no signature, catches the 402, and renders the x402 challenge — proof the pay-per-call gate is real."));
    root.appendChild(controls);

    // result area (blank initially)
    var result = el("div", "mt16");
    result.id = "mkt-result";
    root.appendChild(result);

    // preview card
    var previewCard = el("div", "card mt16");
    previewCard.appendChild(cardHead("Free preview", "no payment · live 2s-fresh"));
    var pstrip = el("div");
    pstrip.innerHTML = '<div class="loading-box"><span class="spin"></span> fetching live teaser…</div>';
    previewCard.appendChild(pstrip);
    var chart = el("div", "chart-box hidden");
    chart.id = "mkt-chart";
    previewCard.appendChild(chart);
    root.appendChild(previewCard);

    // how to pay
    root.appendChild(howToPayCard());
    root.appendChild(axiosExplain());

    renderMarketPreview();
    loadMarketChart();

    var symEl = document.getElementById("mkt-sym");
    var resEl = document.getElementById("mkt-res");
    var intEl = document.getElementById("mkt-int");

    function resourcePath() {
      var s = normSymbol(symEl.value) || "BTCUSDT";
      var type = resEl.value;
      if (type === "ticker") return "/v1/market/" + s + "/ticker";
      if (type === "klines") return "/v1/market/" + s + "/klines?interval=" + (intEl.value || "1h") + "&limit=50";
      return "/v1/market/" + s;
    }

    document.getElementById("mkt-unlock").addEventListener("click", function () {
      doPaidRequest(resourcePath(), { fromButton: true });
    });
    document.getElementById("mkt-demo402").addEventListener("click", function () {
      doPaidRequest(resourcePath(), { demo: true });
    });
    symEl.addEventListener("change", function () {
      mkt.symbol = normSymbol(symEl.value) || "BTCUSDT";
      renderMarketPreview();
      loadMarketChart();
    });
  }

  function doPaidRequest(path, cfg) {
    cfg = cfg || {};
    var spin = document.getElementById("mkt-unlock-spin");
    var btn = document.getElementById("mkt-unlock");
    if (spin && btn) {
      spin.classList.remove("hidden");
      btn.disabled = true;
    }
    clearResult();
    api(path).then(function (r) {
      // Render the returned shape; typically a 402 for a genuinely-live feed.
      renderPaidResponse(r, cfg);
    }).catch(function (e) {
      renderPaidError(e);
    }).finally(function () {
      if (spin && btn) { spin.classList.add("hidden"); btn.disabled = false; }
    });
  }

  function clearResult() {
    var res = document.getElementById("mkt-result");
    if (res) res.innerHTML = "";
  }

  function renderPaidResponse(r, cfg) {
    var res = document.getElementById("mkt-result");
    if (!res) return;
    var wrap = el("div");

    if (r.status === 402) {
      toast("Heads-up: this endpoint requires an on-chain x402 payment.", "warn");
      var banner = el("div", "banner err");
      banner.innerHTML = '<span class="b-ico">⛔</span><div><b>402 Payment Required — paywall is live.</b><p>This endpoint requires an on-chain x402 payment. Run the buyer CLI to settle, then replay with a <span style="font-family:var(--mono);color:var(--accent)">PAYMENT-SIGNATURE</span> header.</p></div>';
      wrap.appendChild(banner);
    } else if (r.status === 200) {
      toast("Paid call authorized (200).", "success");
      var okBanner = el("div", "banner info");
      okBanner.innerHTML = '<span class="b-ico">✓</span><div><b>Authorized — x402 proof accepted.</b> This call was billed and settled on-chain.</div>';
      wrap.appendChild(okBanner);
    } else {
      wrap.appendChild(el("div", "banner warn", '<span class="b-ico">!</span><div>HTTP ' + r.status + ' from the backend.</div>'));
    }

    // challenge panel
    var panel = el("div", "card mt16");
    var chLabel = (r.status === 402) ? "HTTP 402 challenge (auto-captured)" : "Response " + r.status;
    panel.appendChild(cardHead(chLabel, "x402 ~ Payment Required"));
    if (r.status === 402) {
      var www = r.headers.get("WWW-Authenticate");
      var chRow = el("div", "flex wrap small muted mb");
      chRow.innerHTML = '<span class="pill teal">WWW-Authenticate: ' + esc(www || "Payment x402Version=\"2\"") + '</span><span class="pill muted">PAYMENT-REQUIRED header</span>';
      panel.appendChild(chRow);
    }
    var body = (r.json ? JSON.stringify(r.json, null, 2) : r.raw || ("HTTP " + r.status));
    var cb = el("pre", "code-block");
    cb.textContent = body;
    panel.appendChild(cb);
    wrap.appendChild(panel);

    // decoded challenge (if 402)
    if (r.status === 402) {
      var chal = r.headers.get("PAYMENT-REQUIRED");
      if (chal) {
        var dec = null, decoded = "paywall.capture", decodeErr = null;
        try { dec = JSON.parse(atob(chal)); } catch (e) { try { dec = atob(chal); } catch (e2) { decodeErr = "not base64 JSON"; } }
        var decPanel = el("div", "card mt16");
        decPanel.appendChild(cardHead("Decoded challenge", "base64 in PAYMENT-REQUIRED"));
        if (decodeErr) {
          decPanel.appendChild(el("div", "small muted", "Could not decode: " + decodeErr));
        } else {
          var dcb = el("pre", "code-block");
          dcb.textContent = (typeof dec === "string" ? dec : JSON.stringify(dec, null, 2));
          decPanel.appendChild(dcb);
        }
        wrap.appendChild(decPanel);
      }
    }
    res.appendChild(wrap);
  }

  function renderPaidError(e) {
    var res = document.getElementById("mkt-result");
    if (!res) return;
    handleApiFail(e, false);
    res.innerHTML = '<div class="card"><div class="banner err" style="margin-bottom:0"><span class="b-ico">!</span><div><b>' + esc(e.message || "Request failed") + '</b><p>The paid endpoint could not be reached at <span style="font-family:var(--mono)">' + esc(BASE) + '</span>.</p></div></div></div>';
  }

  function renderMarketPreview() {
    var box = viewRoot.querySelector(".card .card-head + div");
    // find the preview pstrip container by structure: the preview card is 2nd card; simplest:
    var cards = viewRoot.querySelectorAll(".card");
    // preview card = the one with id-less pstrip; we stored via: locate the free preview's 'loading-box' parent
    var target = null;
    cards.forEach(function (c) {
      var fb = c.querySelector('.loading-box');
      if (c.querySelector("#mkt-chart")) target = c;
    });
    if (!target) return;
    var holder = target; // target is preview card; first child after head is pstrip via query
    var pstrip = target.querySelector(':scope > div:not(.card-head)');
    var sym = mkt.symbol;
    var sk = '<div class="loading-box"><span class="spin"></span> fetching ' + esc(sym) + ' …</div>';
    if (pstrip) pstrip.innerHTML = sk; else target.insertBefore(el("div", ""), target.children[1]);
    api("/v1/preview/" + sym).then(function (r) {
      if (r.ok && r.json) {
        var box2 = pstrip || target.children[1];
        var d = r.json, t = d.ticker || {};
        var last = t.lastPrice != null ? t.lastPrice : d.price;
        var chg = t.priceChangePercent;
        box2.innerHTML =
          '<div class="pair-card">' +
          '<div class="pair-top"><span class="pair-sym">' + esc(d.symbol || sym) + '</span><span class="pair-chg ' + pctClass(chg) + '">' + pctArrow(chg) + ' ' + (chg != null ? Number(chg).toFixed(2) : "—") + '%</span></div>' +
          '<div class="pair-price">' + fmtNum(last) + '</div>' +
          '<div class="pair-meta"><span>24h H ' + fmtNum(t.highPrice) + '</span><span>L ' + fmtNum(t.lowPrice) + '</span></div>' +
          '<div class="small muted mt">' + esc(d.hint || "") + '</div></div>';
        if (!pairHistory[sym]) pairHistory[sym] = [];
        var arr = pairHistory[sym];
        var now = Date.now();
        if (!arr.length || Math.abs(now - (arr[arr.length - 1].t)) > 3000) { arr.push({ t: now, price: last }); if (arr.length > 90) arr.shift(); }
        loadMarketChart();
      }
    }).catch(function () {
      if (pstrip) pstrip.innerHTML = '<div class="empty-state"><div class="es-ico">◎</div><div class="es-title">Preview unavailable</div><div class="small">Tried ' + esc(BASE) + '/v1/preview/' + esc(sym) + '</div></div>';
    });
  }

  function loadMarketChart() {
    var chart = document.getElementById("mkt-chart");
    if (!chart) return;
    var arr = pairHistory[mkt.symbol] || [];
    if (arr.length < 2) { chart.classList.add("hidden"); return; }
    chart.classList.remove("hidden");
    var values = arr.map(function (p) { return Number(p.price); });
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var rng = (max - min) || 1;
    var W = 940, H = 120, pad = 6;
    function x(i) { return pad + i * ((W - pad * 2) / (values.length - 1)); }
    function y(v) { return pad + (H - pad * 2) * (1 - (v - min) / rng); }
    var up = values[values.length - 1] >= values[0];
    var color = up ? "#22c55e" : "#ef4444";
    var pts = values.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); }).join(" ");
    var area = pad + ",120 " + pts + " " + (W - pad).toFixed(1) + ",120";
    chart.innerHTML =
      '<div class="chart-label"><span>' + esc(mkt.symbol) + ' · live price trail (from free preview)</span>' +
      '<span>' + esc(fmtNum(values[values.length - 1])) + ' ' + (up ? "▲" : "▼") + '</span></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<polygon points="' + area + '" fill="' + color + '" opacity="0.08"/>' +
      '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      '</svg>';
  }

  function howToPayCard() {
    var c = el("div", "card mt16");
    c.appendChild(cardHead("How to pay (x402)", "buyer CLI → settle on-chain → replay"));
    var steps = el("ol", "steps");
    steps.innerHTML =
      '<li>Run the buyer CLI with the target resource:</li>' +
      '<li>It <b>probes the resource</b>, reads the HTTP 402 <span class="inl">PAYMENT-REQUIRED</span> challenge, and <b>settles the micro-payment on-chain</b> from a funded wallet.</li>' +
      '<li>It <b>signs the EIP-712 Payment</b> and replays with a <span class="inl">PAYMENT-SIGNATURE</span> header to receive the <b>billed</b> live payload.</li>';
    c.appendChild(steps);

    var cmd = "cd apps/buyer && npm run buy \"" + BASE + "/v1/market/BTCUSDT\" BTCUSDT";
    var ch = el("div", "mt16");
    ch.innerHTML = '<div class="code-head"><span class="ch-label">terminal</span><button class="copy-btn" data-copy="' + esc(cmd) + '" title="copy">⧉</button></div>';
    var pre = el("pre", "code-block"); pre.textContent = cmd;
    ch.prepend(pre);
    c.appendChild(ch);

    var note = el("div", "small muted mt16");
    note.innerHTML = '<span class="pill muted">One transfer = one request</span> <span class="pill muted">Replay-protected</span> <span class="pill muted">Per-payer daily budget</span>';
    c.appendChild(note);
    return c;
  }

  function axiosExplain() {
    var c = el("div", "card mt16");
    c.appendChild(cardHead("Agent-native by design", "the same gate serves humans and agents"));
    var ul = el("ul", "bullets");
    ul.innerHTML =
      '<li>Every paid call leaves an <b>immutable ledger entry</b> (tx hash, payer, resource, amount).</li>' +
      '<li>The <b>paywall is demonstrable without a funded wallet</b> — the demo button above returns the raw 402 challenge a buyer agent would see.</li>' +
      '<li>Truly-metadata-enriching: richer ticker/candles cost the same per-call unit as spot. Pay once per datum, not per subscription.</li>';
    c.appendChild(ul);
    return c;
  }

  /* =========================================================
     LEDGER
     ========================================================= */
  var ledgerTimer = null;
  var mktPreviewTimer2 = null;

  function renderLedger() {
    var root = viewRoot;
    root.innerHTML = "";

    var head = el("div", "view-head");
    head.appendChild(el("div", "view-eyebrow", "Audit trail"));
    head.appendChild(el("h1", "view-title", "Ledger"));
    head.appendChild(el("p", "view-desc", "Every on-chain micro-payment that unlocked a market call. Wire format matches <span style='font-family:var(--mono);font-size:12px'>GET /ledger</span> — newest first, polled continuously."));
    root.appendChild(head);

    var grid = el("div", "grid grid-2");
    var summary = el("div", "card");
    summary.appendChild(cardHead("Spend overview"));
    summary.appendChild(el("div", "stats", '<div class="stat"><div class="stat-label">paid calls</div><div class="stat-value" id="led-count">0</div></div>' +
      '<div class="stat"><div class="stat-label">total spent</div><div class="stat-value" id="led-total">—</div></div>' +
      '<div class="stat"><div class="stat-label">per-call</div><div class="stat-value" id="led-percall">—</div></div>' +
      '<div class="stat"><div class="stat-label">budget</div><div class="stat-value" id="led-budget">—</div></div>'));
    grid.appendChild(summary);

    var budgetCard = el("div", "card");
    budgetCard.appendChild(cardHead("Spend budget", "per payer · GET /budget"));
    budgetCard.appendChild(el("div", "small muted", "Loading…", ""));
    budgetCard.dataset.role = "budget-card";
    budgetCard.lastChild.textContent = "Loading…";
    grid.appendChild(budgetCard);
    root.appendChild(grid);

    var tableCard = el("div", "card mt16");
    tableCard.appendChild(cardHead("Payments", "GET /ledger"));
    var tw = el("div", "table-wrap");
    tw.innerHTML = '<table><thead><tr>' +
      '<th>tx hash</th><th>payer</th><th>resource</th><th>chain</th><th>amount</th><th>settled</th>' +
      '</tr></thead><tbody id="led-tbody"><tr><td colspan="6"><div class="loading-box"><span class="spin"></span> loading ledger…</div></td></tr></tbody></table>';
    tableCard.appendChild(tw);
    tableCard.appendChild(el("div", "small muted mt", '<span class="pill teal">one transfer = one request</span> <span class="pill muted">replay-protected ledger</span>'));
    root.appendChild(tableCard);

    refreshMeta().then(function () { loadLedger(); });
    if (ledgerTimer === null) ledgerTimer = setInterval(loadLedger, LEDGER_POLL_MS);
  }

  function loadLedger() {
    api("/ledger").then(function (r) {
      if (!r.ok) throw new Error("ledger " + r.status);
      var payments = (r.json && r.json.payments) || [];
      renderLedgerTable(payments);
      var total = payments.reduce(function (a, p) { return a + (Number(p.amount_atomic) || 0); }, 0);
      setEl("led-count", payments.length);
      setEl("led-total", humanAtomic(total, meta.decimals));
      setEl("led-percall", fmtUsd(meta.priceUsdc));
      budgetHumans(payments);
      loadBudget();
      clearGlobalError();
    }).catch(function (e) {
      handleApiFail(e, true);
    });
  }

  function setEl(id, val) { var n = document.getElementById(id); if (n) n.textContent = String(val); }

  function budgetHumans(payments) {
    var b = document.getElementById("led-budget");
    if (b) b.textContent = meta.budgetAtomic == null ? "uncapped" : humanAtomic(meta.budgetAtomic, meta.decimals);
  }

  function renderLedgerTable(payments) {
    var tb = document.getElementById("led-tbody");
    if (!tb) return;
    if (!payments || !payments.length) {
      tb.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="es-ico">≡</div><div class="es-title">No payments yet</div><div class="small">Nothing has been paid for so far. Run the buyer CLI to place the first on-chain call.</div></div></td></tr>';
      return;
    }
    var html = "";
    payments.forEach(function (p) {
      html += '<tr>' +
        '<td class="mono">' + copyShort(p.tx_hash, p.tx_hash) + '</td>' +
        '<td class="mono muted">' + esc(shortAddr(p.payer)) + '</td>' +
        '<td class="mono small">' + esc(p.resource || "—") + '</td>' +
        '<td class="small">' + esc(p.chain_name || "—") + '</td>' +
        '<td class="mono" title="' + esc(String(p.amount_atomic)) + ' atomic">' + esc(humanAtomic(p.amount_atomic, meta.decimals)) + '</td>' +
        '<td class="small muted" title="' + esc(utcTime(p.settled_at)) + '">' + esc(relTime(p.settled_at)) + '</td>' +
        '</tr>';
    });
    tb.innerHTML = html;
  }

  function copyShort(val, full) {
    if (!val) return "—";
    return '<span class="copy-row" style="padding:3px 6px;font-size:12px"><span class="cr-val" style="direction:ltr">' + esc(shortAddr(val)) + '</span>' +
      '<button class="copy-btn" data-clip="' + esc(full) + '" style="width:22px;height:20px" title="copy">⧉</button></span>';
  }

  function loadBudget() {
    var card = viewRoot.querySelector('[data-role="budget-card"]');
    api("/budget").then(function (r) {
      if (!card) return;
      if (!r.ok) throw new Error("budget " + r.status);
      var b = r.json || {};
      var by = b.byPayer || {};
      var keys = Object.keys(by);
      var html = '<div class="small muted" style="margin-bottom:8px">Budget: <b>' + esc(budgetHuman(b.budgetAtomic)) + '</b></div>';
      if (!keys.length) {
        html += '<div class="empty-state" style="padding:14px"><div class="es-title">No payers yet</div><div class="small">Daily spend appears here after the first on-chain call.</div></div>';
      } else {
        html += '<table class="small" style="font-size:12px"><thead><tr><th>payer</th><th>calls</th><th>atomic</th></tr></thead><tbody>';
        keys.forEach(function (k) {
          html += '<tr><td class="mono">' + esc(shortAddr(k)) + '</td><td>' + (by[k].calls || 0) + '</td><td class="mono">' + Number(by[k].atomic || 0).toLocaleString() + '</td></tr>';
        });
        html += '</tbody></table>';
      }
      card.innerHTML = "";
      card.appendChild(cardHead("Spend budget", "per payer · GET /budget"));
      var div = el("div"); div.innerHTML = html; card.appendChild(div);
    }).catch(function (e) { if (card && card.querySelector("[data-role]")) handleApiFail(e, true); });
  }

  /* =========================================================
     STOREFRONT — self-serve "publish a paid feed" rail
     ========================================================= */
  var sfDecimals = 6;

  function renderPublish() {
    var root = viewRoot;
    root.innerHTML = "";

    var head = el("div", "view-head");
    head.appendChild(el("div", "view-eyebrow", "Self-serve rail · Payment Workflows"));
    head.appendChild(el("h1", "view-title", "Publish a paid feed"));
    head.appendChild(el("p", "view-desc", "Turn any Binance symbol/resource into an x402-priced endpoint in one click. Set the $U price (and an optional per-payer daily budget) — every call settles on-chain and hits the replay-protected ledger. It is a rail, not a demo."));
    root.appendChild(head);

    // publish form
    var formCard = el("div", "card");
    formCard.appendChild(cardHead("Publish a feed", "set price + rule"));
    var row = el("div", "field-row");
    row.innerHTML =
      '<div class="field"><label>Symbol</label><input class="input" id="sf-sym" value="LINKUSDT" spellcheck="false" placeholder="BTCUSDT"></div>' +
      '<div class="field"><label>Resource</label><select class="input" id="sf-type">' +
      '<option value="spot">Spot · /v1/market/:sym</option>' +
      '<option value="ticker" selected>24h ticker · :sym/ticker</option>' +
      '<option value="klines">Candles · :sym/klines</option></select></div>' +
      '<div class="field"><label>Price / call ($U)</label><input class="input" id="sf-price" value="0.00005" step="any"></div>' +
      '<div class="field"><label>Daily budget / payer ($U, optional)</label><input class="input" id="sf-budget" placeholder="e.g. 0.002 = cap"></div>';
    var actions = el("div", "field-row mt16");
    actions.innerHTML = '<button class="btn btn-primary" id="sf-create"><span class="spin dark hidden" id="sf-spin"></span> Publish feed</button>';
    row.appendChild(actions);
    formCard.appendChild(row);
    formCard.appendChild(el("div", "small muted mt16", "Price is stored as atomic units of the settle asset (" + (meta.chainId === 97 ? "$U, 18-dec" : "USDC, 6-dec") + "). A per-payer daily budget caps one wallet's spend per day on this feed — leave blank for uncapped."));
    root.appendChild(formCard);

    // published feeds
    var listCard = el("div", "card mt16");
    listCard.appendChild(cardHead("Published feeds", "live endpoints"));
    var tw = el("div", "table-wrap");
    tw.innerHTML = '<table><thead><tr><th>feed</th><th>price</th><th>budget</th><th>resource</th><th>payto</th><th></th></tr></thead><tbody id="sf-tbody"><tr><td colspan="6"><div class="loading-box"><span class="spin"></span> loading storefront…</div></td></tr></tbody></table>';
    listCard.appendChild(tw);
    listCard.appendChild(el("div", "small muted mt", '<span class="pill teal">x402-priced</span> <span class="pill green">replay-proof</span> <span class="pill muted">keyless seller</span>'));
    root.appendChild(listCard);

    document.getElementById("sf-create").addEventListener("click", publishFeed);
    loadFeeds();

    refreshMeta().then(function (h) { if (h && h.decimals != null) sfDecimals = Number(h.decimals); });
  }

  function atomicFromUsd(usd, dec) {
    var thousands = Math.round(Number(usd) * Math.pow(10, dec));
    return String(thousands);
  }
  function usdFromAtomic(a, dec) {
    return Number(a) / Math.pow(10, dec);
  }

  function publishFeed() {
    var spin = document.getElementById("sf-spin");
    var btn = document.getElementById("sf-create");
    if (spin) spin.classList.remove("hidden");
    if (btn) btn.disabled = true;
    var dec = sfDecimals;
    var body = {
      symbol: document.getElementById("sf-sym") ? normSymbol(document.getElementById("sf-sym").value) || "BTCUSDT" : "BTCUSDT",
      type: (document.getElementById("sf-type") && document.getElementById("sf-type").value) || "ticker",
      priceAtomic: atomicFromUsd(document.getElementById("sf-price").value, dec),
    };
    var budget = document.getElementById("sf-budget") && document.getElementById("sf-budget").value;
    if (budget && budget.trim() !== "") body.budgetAtomic = atomicFromUsd(budget, dec);
    api("/api/feeds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) {
        if (r.status === 201) { toast("Feed published — " + (r.json.feed && r.json.feed.resource), "success"); loadFeeds(); }
        else toast("Publish failed: " + ((r.json && r.json.detail) || r.status), "error");
      })
      .catch(function (e) { toast(e.message || "Publish failed", "error"); })
      .finally(function () { if (spin) spin.classList.add("hidden"); if (btn) btn.disabled = false; });
  }

  function loadFeeds() {
    var tb = document.getElementById("sf-tbody");
    api("/api/feeds").then(function (r) {
      if (tb) tb.innerHTML = "";
      if (!r.ok || !r.json) { if (tb) tb.innerHTML = '<tr><td colspan="6"><div class="empty-state">Storefront unavailable</div></td></tr>'; return; }
      var dec = r.json.decimals != null ? Number(r.json.decimals) : sfDecimals;
      sfDecimals = dec;
      var list = r.json.feeds || [];
      if (!list.length) {
        if (tb) tb.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="es-ico">⬦</div><div class="es-title">No feeds published yet</div><div class="small">Publish your first feed above — it becomes a live pay-per-call endpoint + MCP tool.</div></div></td></tr>';
        return;
      }
      var html = "";
      list.forEach(function (f) {
        var res = (f.resource || '').replace(/^\//, '');
        html += '<tr>' +
          '<td class="mono">' + esc(f.symbol) + ' <span class="pill muted">' + esc(f.type) + '</span></td>' +
          '<td class="mono">' + usdFromAtomic(f.price_atomic, dec).toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' $U</td>' +
          '<td class="small">' + (f.budget_atomic != null ? usdFromAtomic(f.budget_atomic, dec).toLocaleString() + ' $U' : "uncapped") + '</td>' +
          '<td class="mono small">' + esc(res) + '</td>' +
          '<td class="mono small muted">' + esc(shortAddr(f.pay_to || "—")) + '</td>' +
          '<td><button class="copy-btn" data-clip="' + esc(BASE + "/" + res) + '" title="copy endpoint">⧉</button></td>' +
          '</tr>';
      });
      if (tb) tb.innerHTML = html;
    }).catch(function (e) { if (tb) tb.innerHTML = '<tr><td colspan="6"><div class="small muted">Storefront unreachable: ' + esc(e.message || "") + '</div></td></tr>'; });
  }

  /* =========================================================
     MCP
     ========================================================= */
  function renderMcp() {
    var root = viewRoot;
    root.innerHTML = "";

    var head = el("div", "view-head");
    head.appendChild(el("div", "view-eyebrow", "Machine-readable commerce"));
    head.appendChild(el("h1", "view-title", "MCP tools for agents"));
    head.appendChild(el("p", "view-desc", "The same paid endpoints are exposed to autonomous agents over the Model Context Protocol. An agent calls a tool, the server answers with an HTTP 402 challenge, the agent settles on-chain and replays — <b>the agent pays per call, atomically</b>."));
    root.appendChild(head);

    // tools
    var toolsCard = el("div", "card");
    toolsCard.appendChild(cardHead("The 3 paid tools", "live Binance feed behind the x402 gate"));
    var tbl = el("div", "table-wrap");
    tbl.innerHTML =
      '<table><thead><tr><th>tool</th><th>resource</th><th>returns</th></tr></thead><tbody>' +
      '<tr><td class="mono">get_market_data</td><td class="mono small">/v1/market/:sym</td><td class="small muted">live spot price</td></tr>' +
      '<tr><td class="mono">get_quote</td><td class="mono small">/v1/market/:sym/ticker</td><td class="small muted">24h change · high/low · volume</td></tr>' +
      '<tr><td class="mono">get_klines</td><td class="mono small">/v1/market/:sym/klines</td><td class="small muted">OHLCV candles (1m–1d · ≤200)</td></tr>' +
      '</tbody></table>';
    toolsCard.appendChild(tbl);
    toolsCard.appendChild(el("div", "small muted mt", '<span class="pill teal">x402 priced</span> <span class="pill green">same ledger / replay ring as REST</span>'));
    root.appendChild(toolsCard);

    // stdio config
    var stdioCard = el("div", "card mt16");
    stdioCard.appendChild(cardHead("Standard I/O (stdio)", "add to Claude Code / Cursor / any MCP client"));
    var absPath = "/home/ubuntu/x402-commerce/apps/mcp/src/server.js";
    var cfg = JSON.stringify({
      mcpServers: {
        "xpay-commerce": {
          command: "node",
          args: ["--dns-result-order=ipv4first", absPath]
        }
      }
    }, null, 2);
    stdioCard.appendChild(el("p", "small muted mb", "Paste into your client's <span style='font-family:var(--mono);color:var(--accent)'>.mcp.json</span> / <span style='font-family:var(--mono);color:var(--accent)'>mcpServers</span> config:"));
    var codeHead = el("div", "code-head");
    codeHead.innerHTML = '<span class="ch-label">mcpServers · json</span><button class="copy-btn" data-copy="' + esc(cfg) + '">⧉</button>';
    var pre = el("pre", "code-block"); pre.textContent = cfg;
    codeHead.appendChild(pre);
    stdioCard.appendChild(codeHead);
    root.appendChild(stdioCard);

    // SSE
    var sseCard = el("div", "card mt16");
    sseCard.appendChild(cardHead("HTTP + Server-Sent-Events", BASE + "/mcp"));
    var sseCmd = BASE + "/mcp";
    var sh = el("div", "code-head");
    sh.innerHTML = '<span class="ch-label">URL</span><button class="copy-btn" data-copy="' + esc(sseCmd) + '">⧉</button>';
    var spre = el("pre", "code-block"); spre.textContent = sseCmd; sh.appendChild(spre);
    sseCard.appendChild(sh);
    sseCard.appendChild(el("div", "small muted mt", "Remote agents (e.g. an agent running elsewhere) reach the same paid tools over HTTP/SSE on this port — no filesystem path needed, just the endpoint."));
    root.appendChild(sseCard);
  }

  /* =========================================================
     GLOBAL copy-button delegation
     ========================================================= */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".copy-btn[data-clip]");
    if (btn) { copyText(btn.getAttribute("data-clip"), "value"); return; }
    var sbtn = e.target.closest(".copy-btn[data-copy]");
    if (sbtn) { copyText(sbtn.getAttribute("data-copy"), "snippet"); }
  });

  /* ---------------- init ---------------- */
  // update base chip (already set above); start routing
  refreshMeta(); // warms meta for other views
  navigate();
})();