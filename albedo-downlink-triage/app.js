// DownlinkIQ: generate scenes, estimate cloud cover from pixels, score value, and pack
// the pass budget greedily (full-res for high value, thumbnails for the rest).

const N = 70;
const PX = 48;
const THUMB_GB = 0.02;
const rnd = Util.rng(1234);

function makeScene(i) {
  const c = document.createElement("canvas");
  c.width = c.height = PX;
  const g = c.getContext("2d");
  const img = g.createImageData(PX, PX);
  const water = rnd() < 0.3;
  const cloudiness = rnd() < 0.45 ? 0.35 + rnd() * 0.6 : rnd() * 0.25;
  const blobs = Array.from({ length: 5 }, () => ({ x: rnd() * PX, y: rnd() * PX, r: 6 + rnd() * 16 }));
  const tasked = rnd() < 0.35;
  const change = rnd() < 0.2 && !water; // change detection only meaningful over land
  for (let y = 0; y < PX; y++) {
    for (let x = 0; x < PX; x++) {
      const k = (y * PX + x) * 4;
      let r, gg, b;
      if (water) { r = 30; gg = 70 + 20 * Math.sin(x / 5); b = 110; }
      else {
        const road = (x % 16 === 0 || y % 13 === 0) ? 1 : 0;
        const field = ((x >> 3) + (y >> 3)) % 2;
        r = road ? 150 : field ? 95 : 120; gg = road ? 150 : field ? 120 : 105; b = road ? 145 : 70;
      }
      const d = Math.min(...blobs.map((bl) => Math.hypot(x - bl.x, y - bl.y) / bl.r));
      const cloud = Math.max(0, Math.min(1, (cloudiness * 2.2 - d) * 1.6));
      img.data[k] = r + (245 - r) * cloud; img.data[k + 1] = gg + (245 - gg) * cloud; img.data[k + 2] = b + (248 - b) * cloud; img.data[k + 3] = 255;
    }
  }
  if (change && !water) for (let y = 20; y < 28; y++) for (let x = 22; x < 32; x++) { const k = (y * PX + x) * 4; img.data[k] = 210; img.data[k + 1] = 60; img.data[k + 2] = 50; }
  g.putImageData(img, 0, 0);
  return { i, canvas: c, tasked, change, water };
}

// Onboard estimate: share of bright, low-saturation pixels.
function cloudFraction(scene) {
  const d = scene.canvas.getContext("2d").getImageData(0, 0, PX, PX).data;
  let n = 0;
  for (let k = 0; k < d.length; k += 4) {
    const mx = Math.max(d[k], d[k + 1], d[k + 2]), mn = Math.min(d[k], d[k + 1], d[k + 2]);
    if (mx > 200 && mx - mn < 30) n++;
  }
  return n / (d.length / 4);
}

const scenes = Array.from({ length: N }, (_, i) => makeScene(i));
scenes.forEach((s) => { s.cloud = cloudFraction(s); });
const usable = (s) => s.cloud <= 0.4;
const score = (s) => (usable(s) ? 1 : 0.05) * (1 + (s.tasked ? 3 : 0) + (s.change ? 2 : 0)) * (1 - s.cloud) * (s.water && !s.tasked ? 0.3 : 1);

function renderGrid() {
  document.getElementById("grid").innerHTML = "";
  scenes.forEach((s) => {
    const t = document.createElement("div");
    t.className = "tile";
    t.id = `t${s.i}`;
    const cv = document.createElement("canvas");
    cv.width = cv.height = PX;
    cv.getContext("2d").drawImage(s.canvas, 0, 0);
    t.appendChild(cv);
    const tags = `${s.tasked ? "T" : ""}${s.change ? "Δ" : ""}`;
    if (tags) t.insertAdjacentHTML("beforeend", `<span class="tag">${tags}</span>`);
    document.getElementById("grid").appendChild(t);
  });
}

function budgetGb() {
  return (+document.getElementById("mins").value * 60 * +document.getElementById("rate").value) / 8000;
}

function plan(mode) {
  const sceneGb = +document.getElementById("gb").value;
  let left = budgetGb();
  const order = mode === "fifo" ? [...scenes] : [...scenes].sort((a, b) => score(b) - score(a));
  const result = new Map();
  const thumbReserve = mode === "triage" ? N * THUMB_GB : 0; // keep room for a thumbnail of everything
  left -= thumbReserve;
  for (const s of order) {
    if (mode === "triage" && !usable(s)) continue;
    if (left >= sceneGb) { result.set(s.i, "down"); left -= sceneGb; }
  }
  left += thumbReserve;
  if (mode === "triage") for (const s of order) if (!result.has(s.i) && left >= THUMB_GB) { result.set(s.i, "thumb"); left -= THUMB_GB; }
  return { result, order, used: budgetGb() - left };
}

function summarize(p) {
  const down = scenes.filter((s) => p.result.get(s.i) === "down");
  return {
    down: down.length,
    usableTasked: down.filter((s) => s.tasked && usable(s)).length,
    changes: down.filter((s) => s.change && usable(s)).length,
    cloudyGb: down.filter((s) => !usable(s)).length * +document.getElementById("gb").value,
    thumbs: scenes.filter((s) => p.result.get(s.i) === "thumb").length,
  };
}

let fifoSum = null;

function show(mode) {
  const p = plan(mode);
  scenes.forEach((s) => {
    const t = document.getElementById(`t${s.i}`);
    const st = p.result.get(s.i);
    t.className = `tile ${st === "down" ? "down" : st === "thumb" ? "thumb" : "defer"} ${usable(s) ? "" : "cloud"}`;
  });
  const sum = summarize(p);
  if (mode === "fifo") fifoSum = sum;
  const tot = { tasked: scenes.filter((s) => s.tasked && usable(s)).length, change: scenes.filter((s) => s.change && usable(s)).length };
  ["kpis", "out"].forEach((id) => document.getElementById(id).classList.remove("hidden"));
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="v">${budgetGb().toFixed(0)} GB</div><div class="l">pass budget</div></div>
    <div class="kpi"><div class="v">${sum.down}</div><div class="l">full-res scenes downlinked</div></div>
    <div class="kpi"><div class="v" style="color:var(--good)">${sum.usableTasked}/${tot.tasked}</div><div class="l">clear customer-tasked scenes delivered</div></div>
    <div class="kpi"><div class="v" style="color:${sum.cloudyGb ? "var(--bad)" : "var(--good)"}">${sum.cloudyGb.toFixed(0)} GB</div><div class="l">spent on cloudy scenes</div></div>`;
  const row = (label, s) => s ? `<tr><td>${label}</td><td class="num">${s.usableTasked} / ${tot.tasked}</td><td class="num">${s.changes} / ${tot.change}</td><td class="num">${s.cloudyGb.toFixed(0)} GB</td><td class="num">${s.thumbs}</td></tr>` : "";
  document.getElementById("cmp").innerHTML = `<tr><th>Plan</th><th class="num">Tasked, clear</th><th class="num">Changes caught</th><th class="num">Wasted on cloud</th><th class="num">Thumbnails</th></tr>` +
    row("First-in first-out", fifoSum) + (mode === "triage" ? row("Onboard triage", sum) : "");
  document.getElementById("queue").innerHTML = `<tr><th>Scene</th><th class="num">Cloud</th><th>Flags</th><th class="num">Score</th><th>Action</th></tr>` +
    [...scenes].sort((a, b) => score(b) - score(a)).slice(0, 8).map((s) => `<tr><td>#${s.i + 1}</td><td class="num">${(s.cloud * 100).toFixed(0)}%</td>
      <td>${s.tasked ? '<span class="badge info">tasked</span> ' : ""}${s.change ? '<span class="badge warn">change</span>' : ""}</td><td class="num">${score(s).toFixed(2)}</td>
      <td>${p.result.get(s.i) === "down" ? '<span class="badge good">downlink</span>' : p.result.get(s.i) === "thumb" ? '<span class="badge warn">thumbnail</span>' : '<span class="badge bad">deferred</span>'}</td></tr>`).join("");
}

renderGrid();
document.getElementById("fifo").addEventListener("click", () => show("fifo"));
document.getElementById("triage").addEventListener("click", () => { if (!fifoSum) show("fifo"); show("triage"); });

Demo.run({
  intro: { kicker: "Bottleneck 10 of 10 · Albedo", title: "More pixels than the pass can carry",
    body: ["Albedo's Clarity-1 sends imagery down an 800 Mbps X-band link, across 25 ground stations. A single station sees the satellite for only about ten minutes.",
      "At 10 cm resolution every scene is large, so whatever goes down first decides what customers get."],
    source: "Sources: albedo.com (Clarity-1: what worked) · APNIC blog (constellation data) · ESA/Axelera (onboard AI)" },
  outro: { kicker: "Result", title: "Every pass carries the scenes that matter",
    bullets: ["Cloud cover estimated on board from the pixels", "Customer-tasked, clear and changed scenes go first",
      "No bandwidth spent on cloudy scenes; cheap thumbnails keep the catalog complete", "The same pass delivers far more usable imagery"] },
}, [
  () => Demo.caption("Seventy scenes are queued on board since the last pass. Many are cloudy; some are customer-tasked (T) or show a change (Δ)."),
  () => Demo.highlight("#grid", 3000),
  () => Demo.caption("Today's approach: send them in capture order until the 10-minute pass runs out."),
  () => Demo.click("#fifo"),
  () => Demo.highlight("#grid", 2600),
  () => Demo.caption("Much of the pass goes on cloudy scenes, and clear tasked ones get left behind."),
  () => Demo.highlight("#kpis", 2800),
  () => Demo.caption("With onboard triage: estimate the cloud, score the value, then pack the pass."),
  () => Demo.click("#triage"),
  () => Demo.highlight("#grid", 3000),
  () => Demo.caption("Same pass, same link: more clear tasked scenes, every change caught, and no bandwidth spent on cloud."),
  () => Demo.highlight("#out", 3800),
]);
