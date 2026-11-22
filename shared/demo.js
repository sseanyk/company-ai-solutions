// Autoplay driver for the demo videos. Only runs when the page URL has ?demo.
// Opened normally, every tool is an ordinary interactive page.
const Demo = (() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (sel) => {
    const el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!el) throw new Error(`Demo: element not found: ${sel}`);
    return el;
  };
  let cursor = null;
  let cap = null;

  function ensureOverlays() {
    if (cursor) return;
    cursor = document.createElement("div");
    cursor.className = "demo-cursor";
    cap = document.createElement("div");
    cap.className = "demo-caption";
    document.body.append(cursor, cap);
  }

  async function caption(text, ms = 2600) {
    ensureOverlays();
    cap.classList.remove("show");
    await sleep(150);
    cap.textContent = text;
    cap.classList.add("show");
    await sleep(ms);
  }

  async function reveal(sel) {
    const el = q(sel);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    await sleep(650);
    return el;
  }

  async function moveTo(el) {
    ensureOverlays();
    const r = el.getBoundingClientRect();
    cursor.style.left = `${r.left + Math.min(r.width / 2, 60)}px`;
    cursor.style.top = `${r.top + r.height / 2}px`;
    await sleep(750);
  }

  async function click(sel) {
    const el = await reveal(sel);
    await moveTo(el);
    cursor.classList.add("down");
    await sleep(180);
    cursor.classList.remove("down");
    el.click();
    await sleep(500);
  }

  async function type(sel, text, perChar = 30) {
    const el = await reveal(sel);
    await moveTo(el);
    el.focus();
    el.value = "";
    for (const ch of text) {
      el.value += ch;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(perChar);
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(300);
  }

  async function setValue(sel, value) {
    const el = await reveal(sel);
    await moveTo(el);
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(500);
  }

  async function highlight(sel, ms = 2200) {
    const el = await reveal(sel);
    el.classList.add("demo-hl");
    await sleep(ms);
    el.classList.remove("demo-hl");
  }

  async function card({ kicker, title, body = [], bullets = [], source = "", ms = 6000 }) {
    const c = document.createElement("div");
    c.className = "demo-card";
    const paras = body.map((p) => `<p>${p}</p>`).join("");
    const list = bullets.length ? `<ul>${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>` : "";
    const src = source ? `<div class="src">${source}</div>` : "";
    c.innerHTML = `<div class="inner"><div class="kicker">${kicker}</div><h1>${title}</h1>${paras}${list}${src}</div>`;
    document.body.appendChild(c);
    await sleep(ms);
    c.remove();
    await sleep(200);
  }

  // meta: { intro: cardSpec, outro: cardSpec }, steps: array of async functions
  async function run(meta, steps) {
    if (!new URLSearchParams(location.search).has("demo")) return;
    window.scrollTo(0, 0);
    await sleep(400);
    try {
      await card(meta.intro);
      for (const step of steps) await step();
      if (cap) cap.classList.remove("show");
      await sleep(600);
      await card(meta.outro);
    } catch (err) {
      console.error(err);
      window.__demoError = String(err);
    }
    window.__demoDone = true;
  }

  return { sleep, caption, click, type, setValue, highlight, reveal, card, run };
})();

// Small shared helpers used by several tools.
const Util = {
  // Deterministic PRNG so the synthetic data (and the videos) are reproducible.
  rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  fmt(n, d = 0) {
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },
  download(name, text, type = "text/plain") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  // Simple line chart on a canvas. series: [{ name, color, points: [[x, y], ...], dash }]
  lineChart(canvas, series, { xLabel = "", yLabel = "", yMin = null, yMax = null, hLines = [] } = {}) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    g.clearRect(0, 0, W, H);
    const pad = { l: 52, r: 14, t: 12, b: 34 };
    const all = series.flatMap((s) => s.points);
    if (!all.length) return;
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]).concat(hLines.map((h) => h.y));
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = yMin ?? Math.min(...ys), y1 = yMax ?? Math.max(...ys);
    const X = (x) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
    const Y = (y) => H - pad.b - ((y - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);
    g.strokeStyle = "#e2e5ea"; g.fillStyle = "#646b78"; g.font = "11px sans-serif"; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yv = y0 + ((y1 - y0) * i) / 4;
      g.beginPath(); g.moveTo(pad.l, Y(yv)); g.lineTo(W - pad.r, Y(yv)); g.stroke();
      g.fillText(Util.fmt(yv, Math.abs(y1 - y0) < 10 ? 2 : 0), 4, Y(yv) + 4);
    }
    for (let i = 0; i <= 5; i++) {
      const xv = x0 + ((x1 - x0) * i) / 5;
      g.fillText(Util.fmt(xv, 0), X(xv) - 8, H - pad.b + 15);
    }
    g.fillText(xLabel, W / 2 - 20, H - 4);
    g.save(); g.translate(12, pad.t + 70); g.rotate(-Math.PI / 2); g.fillText(yLabel, -40, 0); g.restore();
    for (const h of hLines) {
      g.strokeStyle = h.color || "#c62f2f"; g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(pad.l, Y(h.y)); g.lineTo(W - pad.r, Y(h.y)); g.stroke();
      g.setLineDash([]); g.fillStyle = h.color || "#c62f2f"; g.fillText(h.label || "", W - pad.r - 90, Y(h.y) - 4);
    }
    series.forEach((s, i) => {
      if (s.dots) {
        g.fillStyle = s.color;
        s.points.forEach(([x, y]) => { g.beginPath(); g.arc(X(x), Y(y), 4.5, 0, 7); g.fill(); });
      } else {
        g.strokeStyle = s.color; g.lineWidth = s.width || 2; g.setLineDash(s.dash || []);
        g.beginPath();
        s.points.forEach(([x, y], j) => (j ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
        g.stroke(); g.setLineDash([]);
      }
      g.fillStyle = s.color; g.fillRect(pad.l + 8 + i * 150, pad.t, 10, 10);
      g.fillStyle = "#16181d"; g.fillText(s.name, pad.l + 22 + i * 150, pad.t + 9);
      (s.marks || []).forEach(([x, y]) => { g.beginPath(); g.arc(X(x), Y(y), 5, 0, 7); g.fillStyle = "#c62f2f"; g.fill(); });
    });
  },
};
