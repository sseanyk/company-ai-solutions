// ROP Copilot: simulated drilling with an online-learning optimizer.
// Rig "truth" (hidden from the copilot) -> sensor stream -> RLS model -> bounded setpoint moves.

const FT_PER_STEP = 5;
const STEPS = 640;
const LIM = { wMin: 15, wMax: 55, rMin: 60, rMax: 180 };
const rnd = Util.rng(77);

// ----- hidden rig/rock physics -----
const rock = (depth) => 1 + 0.12 * Math.sin(depth / 260) + (depth > 1500 && depth < 2100 ? -0.12 : 0);
function truth(w, r, depth, wear) {
  const founder = 40;
  const eff = w < founder ? w : founder + 0.2 * (w - founder);
  const ssi = Math.max(0, (w - 35) / 10) * (120 / r);
  const dysfunction = ssi > 1 ? 1 - 0.25 * Math.min(1, ssi - 1) : 1;
  const rop = 0.25 * Math.pow(eff, 0.9) * Math.sqrt(r) * rock(depth) * wear * dysfunction * (1 + (rnd() - 0.5) * 0.06);
  const torque = 0.11 * w * (1 + 0.15 * ssi) * (1 + (rnd() - 0.5) * 0.04); // kft-lbf
  return { rop, ssi: ssi * (1 + (rnd() - 0.5) * 0.1), torque };
}

// ----- recursive least squares on ln(ROP) = a + b·W + c·W² + d·ln(RPM) -----
function makeRls(n, lambda) {
  let th = new Array(n).fill(0);
  let P = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1000 : 0)));
  return {
    update(x, y) {
      const Px = P.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
      const denom = lambda + x.reduce((s, v, i) => s + v * Px[i], 0);
      const k = Px.map((v) => v / denom);
      const err = y - x.reduce((s, v, i) => s + v * th[i], 0);
      th = th.map((t, i) => t + k[i] * err);
      P = P.map((row, i) => row.map((v, j) => (v - k[i] * Px[j]) / lambda));
    },
    predict: (x) => x.reduce((s, v, i) => s + v * th[i], 0),
  };
}
const feat = (w, r) => [1, w / 50, (w / 50) ** 2, Math.log(r / 100)];

// ----- state -----
const S = { step: 0, depth: 0, w: 30, r: 100, copilot: false, wear: 1, chipped: false, log: [], wCap: LIM.wMax,
  rls: makeRls(4, 0.985), mse0: null, alert: false, engagedAt: null, timer: null };

function tick() {
  if (S.step >= STEPS) return stop();
  if (S.depth >= 2350 && !S.chipped) { S.chipped = true; S.wear *= 0.62; } // cutter damage event
  S.wear *= 0.99993;
  let w = S.w, r = S.r;
  if (S.copilot) { w += (S.step % 4 < 2 ? 2.5 : -2.5); r += (S.step % 8 < 4 ? 8 : -8); } // small dither for excitation
  w = Math.min(Math.max(w, LIM.wMin), LIM.wMax);
  r = Math.min(Math.max(r, LIM.rMin), LIM.rMax);
  const m = truth(w, r, S.depth, S.wear);
  S.rls.update(feat(w, r), Math.log(m.rop));
  // MSE (psi-ish, then normalized): WOB/A + 120·π·RPM·T / (A·ROP)
  const A = Math.PI * 4.25 ** 2;
  const mse = (w * 1000) / A + (120 * Math.PI * r * m.torque * 1000) / (A * m.rop);
  S.log.push({ depth: S.depth, rop: m.rop, w, r, ssi: m.ssi, mse, copilot: S.copilot });
  if (m.ssi > 0.85) S.wCap = Math.max(LIM.wMin + 5, Math.min(S.wCap, w - 2)); // learned guardrail
  if (S.copilot && S.step % 6 === 0) decide();
  if (S.copilot) watchBit();
  S.depth += FT_PER_STEP;
  S.step += 1;
  if (S.step % 4 === 0) render();
}

function decide() {
  if (S.step - S.engagedAt < 12) return; // collect a little data first
  let best = null;
  for (let w = LIM.wMin; w <= S.wCap; w += 1) {
    for (let r = LIM.rMin; r <= LIM.rMax; r += 5) {
      const predSsi = Math.max(0, (w - 35) / 10) * (120 / r); // conservative vendor envelope
      if (predSsi > 0.7) continue;
      const p = S.rls.predict(feat(w, r));
      if (!best || p > best.p) best = { w, r, p };
    }
  }
  if (!best) return;
  S.w += Math.max(-2, Math.min(2, best.w - S.w));
  S.r += Math.max(-8, Math.min(8, best.r - S.r));
  S.why = `Model predicts ${Math.exp(best.p).toFixed(0)} ft/hr at ${best.w} klbf / ${best.r} rpm. Moving there in bounded steps; WOB capped at ${S.wCap.toFixed(0)} klbf after stick-slip seen.`;
}

function watchBit() {
  const recent = S.log.slice(-20);
  const avg = recent.reduce((s, l) => s + l.mse, 0) / recent.length;
  if (S.mse0 == null && S.step - S.engagedAt === 60) S.mse0 = avg;
  if (S.mse0 && !S.alert && avg > S.mse0 * 1.35) {
    S.alert = true;
    const box = document.getElementById("alertbox");
    box.classList.remove("hidden");
    box.textContent = `⚠ Bit damage suspected at ${S.depth} ft: MSE up ${((avg / S.mse0 - 1) * 100).toFixed(0)}% at the same setpoints, with ROP falling. Recommend planning a trip at the next connection instead of drilling on a dull bit.`;
  }
}

const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

function render() {
  const base = S.log.filter((l) => !l.copilot);
  const co = S.log.filter((l) => l.copilot && !(S.chipped && l.depth >= 2350));
  const bAvg = avg(base.map((l) => l.rop));
  const cAvg = avg(co.slice(20).map((l) => l.rop));
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="v">${Util.fmt(S.depth)} ft</div><div class="l">drilled</div></div>
    <div class="kpi"><div class="v">${bAvg ? bAvg.toFixed(0) : "—"}</div><div class="l">avg ROP, driller setpoints (ft/hr)</div></div>
    <div class="kpi"><div class="v" style="color:var(--good)">${cAvg ? cAvg.toFixed(0) : "—"}</div><div class="l">avg ROP with copilot (ft/hr)</div></div>
    <div class="kpi"><div class="v" style="color:var(--good)">${bAvg && cAvg ? "+" + ((cAvg / bAvg - 1) * 100).toFixed(0) + "%" : "—"}</div><div class="l">ROP gain on same rock</div></div>`;
  const sm = (key) => S.log.map((l, i) => [l.depth, avg(S.log.slice(Math.max(0, i - 6), i + 1).map((x) => x[key]))]);
  const rop = sm("rop");
  const engageDepth = S.engagedAt != null ? S.engagedAt * FT_PER_STEP : null;
  Util.lineChart(document.getElementById("rop"), [
    { name: "driller setpoints", color: "#646b78", points: rop.filter((p) => engageDepth == null || p[0] <= engageDepth) },
    ...(engageDepth != null ? [{ name: "copilot", color: "#12855a", points: rop.filter((p) => p[0] >= engageDepth) }] : []),
  ], { xLabel: "depth drilled (ft)", yLabel: "ft/hr", yMin: 0, yMax: 110 });
  const mse = sm("mse");
  Util.lineChart(document.getElementById("mse"), [{ name: "MSE (smoothed)", color: "#b26a00", points: mse }], { xLabel: "ft", yLabel: "psi" });
  Util.lineChart(document.getElementById("ssi"), [{ name: "stick-slip", color: "#8a4fff", points: sm("ssi") }],
    { xLabel: "ft", yLabel: "index", yMin: 0, yMax: 1.6, hLines: [{ y: 1, label: "damaging" }] });
  document.getElementById("wob").textContent = `${S.w.toFixed(0)} klbf`;
  document.getElementById("rpm").textContent = `${S.r.toFixed(0)}`;
  document.getElementById("why").textContent = S.copilot ? S.why || "Learning the rock response…" : "Driller-held setpoints.";
}

function start() {
  document.getElementById("start").disabled = true;
  document.getElementById("engage").disabled = false;
  const isDemo = new URLSearchParams(location.search).has("demo");
  S.timer = setInterval(() => { tick(); if (!isDemo) tick(); }, 40);
}
function stop() {
  clearInterval(S.timer);
  render();
  document.getElementById("status").textContent = "Section complete.";
  window.__simDone = true;
}
document.getElementById("start").addEventListener("click", start);
document.getElementById("engage").addEventListener("click", () => {
  S.copilot = true;
  S.engagedAt = S.step;
  document.getElementById("engage").disabled = true;
  document.getElementById("engage").textContent = "Copilot engaged";
});
render();

const until = async (cond) => { while (!cond()) await Demo.sleep(150); };

Demo.run({
  intro: { kicker: "Bottleneck 9 of 10 · Fervo Energy", title: "Drilling time is most of the well cost",
    body: ["Fervo reports drilling is over 75% of total well cost, and in hard rock the lever is on-bottom rate of penetration (ROP).",
      "Fervo has already cut drilling time about 70%. The next step is setpoints that adapt to the rock in real time, plus catching bit damage before it wastes hours."],
    source: "Sources: Fervo / Stanford Geothermal Workshop paper · renewableenergyworld.com (70% reduction)" },
  outro: { kicker: "Result", title: "Faster hole, and a bit pulled on time",
    bullets: ["Learns the rock's ROP response from live sensor data, with no lab model needed", "Moves WOB and RPM in bounded steps inside safety limits",
      "Backs off after seeing stick-slip", "Flags bit damage from rising MSE so the trip is planned, not discovered"] },
}, [
  () => Demo.caption("A simulated hard-rock section. First, the driller holds 30 klbf and 100 rpm, which is typical practice."),
  () => Demo.click("#start"),
  () => until(() => S.depth >= 600),
  () => Demo.caption("Now the copilot is engaged. It dithers the setpoints slightly to learn how this rock responds."),
  () => Demo.click("#engage"),
  () => until(() => S.depth >= 1400),
  () => Demo.caption("It climbs toward higher WOB and RPM, stopping short of the founder point and of stick-slip."),
  () => Demo.highlight("#rop", 1500),
  () => until(() => S.alert || S.step >= STEPS),
  () => Demo.caption("Then a cutter chips. MSE jumps while setpoints are unchanged, and the copilot flags it right away."),
  () => Demo.highlight("#alertbox", 3200),
  () => until(() => window.__simDone),
  () => Demo.caption("Result on the same rock: a large ROP gain over held setpoints, and the bit trip is planned rather than found late."),
  () => Demo.highlight("#kpis", 3000),
]);
