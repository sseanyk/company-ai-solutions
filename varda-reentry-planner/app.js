// ReentryOps: enumerate deorbit opportunities, test each against every stakeholder's
// constraint, rank the survivors, and generate one coordination packet.

const DAYS = 14;
const ORBIT_MIN = 94.6;
const T0 = new Date("2026-11-23T00:00:00Z").getTime();
const UTC_OFFSET_H = -7; // Utah (MST)
const rnd = Util.rng(450);

// Range (UTTR) blocks reserved for other users: [startHour, endHour] from T0
let rangeBlocks = [[20, 70], [140, 190], [230, 250], [300, 330]];
const wind = Array.from({ length: DAYS * 24 }, (_, h) => 6 + 9 * Math.abs(Math.sin(h / 17)) + rnd() * 6 + (h > 96 && h < 130 ? 10 : 0));

// Synthetic ground track: once a day the orbit passes almost over the Utah target, and the
// neighbouring orbits pass ~one ground-track spacing away. That pass drifts earlier each day.
function opportunities() {
  const ops = [];
  const n = Math.floor((DAYS * 24 * 60) / ORBIT_MIN);
  for (let k = 0; k < n; k++) {
    const t = k * ORBIT_MIN; // minutes from T0 (UTC)
    const day = Math.floor((t / 60 - UTC_OFFSET_H) / 24);
    const passHour = day * 24 + (15 - 0.9 * day) - UTC_OFFSET_H; // best pass, UTC hours from T0
    const j = Math.round((t / 60 - passHour) / (ORBIT_MIN / 60));
    const xr = 8 + 140 * Math.abs(Math.sin((Math.PI * j) / 15.5)) + rnd() * 8;
    ops.push({ k, t, xr });
  }
  return ops;
}

function evaluate(op, c) {
  const hour = op.t / 60;
  const localHour = (((hour + UTC_OFFSET_H) % 24) + 24) % 24;
  const w = wind[Math.min(Math.floor(hour), wind.length - 1)];
  const ec = 2e-6 * Math.exp(op.xr / 12); // risk grows as the footprint drifts toward populated areas
  const fails = [];
  if (op.xr > c.xr) fails.push(`cross-range ${op.xr.toFixed(0)} km`);
  if (ec > c.ec) fails.push(`Ec ${ec.toExponential(1)}`);
  if (w > c.wind) fails.push(`wind ${w.toFixed(0)} kt`);
  if (hour < c.lead) fails.push(`inside ${c.lead} h NOTAM lead`);
  if (c.day && (localHour < 7.5 || localHour > 16.5)) fails.push("night (recovery)");
  if (rangeBlocks.some(([a, b]) => hour >= a && hour <= b)) fails.push("UTTR reserved");
  const score = (c.xr - op.xr) / c.xr + (c.wind - w) / c.wind + Math.log10(c.ec / ec) / 2;
  return { ...op, hour, localHour, w, ec, fails, ok: fails.length === 0, score };
}

let last = null;

const BLOCKERS = [["cross-range", "Cross-range"], ["Ec", "Public risk (Ec)"], ["wind", "Wind"], ["inside", "NOTAM lead time"],
  ["night", "Night (recovery)"], ["UTTR", "Range reserved"]];
const blockerName = (f) => (BLOCKERS.find(([p]) => f.startsWith(p)) || [f, f])[1];

function plan() {
  const c = {
    xr: +document.getElementById("xr").value, wind: +document.getElementById("wind").value,
    ec: parseFloat(document.getElementById("ec").value), lead: +document.getElementById("lead").value,
    day: document.getElementById("day").value === "1",
  };
  const all = opportunities().map((o) => evaluate(o, c));
  const good = all.filter((o) => o.ok).sort((a, b) => b.score - a.score);
  last = { all, good, c };
  render();
  document.getElementById("deny").disabled = good.length === 0;
}

const stamp = (hour) => {
  const d = new Date(T0 + hour * 3600e3 + UTC_OFFSET_H * 3600e3);
  return `${d.toISOString().slice(5, 10)} ${d.toISOString().slice(11, 16)} MST`;
};

function render() {
  const { all, good, c } = last;
  ["kpis", "tlbox", "out"].forEach((id) => document.getElementById(id).classList.remove("hidden"));
  const reasons = {};
  all.filter((o) => !o.ok).forEach((o) => o.fails.forEach((f) => { const k = blockerName(f); reasons[k] = (reasons[k] || 0) + 1; }));
  const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="v">${all.length}</div><div class="l">deorbit opportunities, 14 days</div></div>
    <div class="kpi"><div class="v" style="color:var(--good)">${good.length}</div><div class="l">pass every constraint</div></div>
    <div class="kpi"><div class="v">${good[0] ? stamp(good[0].hour).slice(0, 11) : "—"}</div><div class="l">best window (local)</div></div>
    <div class="kpi"><div class="v" style="font-size:16px">${top ? top[0] : "—"}</div><div class="l">most common blocker</div></div>`;
  drawTimeline(all);
  document.getElementById("wins").innerHTML = `<tr><th>#</th><th>Deorbit burn</th><th class="num">Cross-range</th><th class="num">Wind</th><th class="num">Ec</th><th>Backup</th></tr>` +
    good.slice(0, 6).map((o, i) => `<tr${i === 0 ? ' style="background:#e3f5ec"' : ""}><td>${i + 1}</td><td>${stamp(o.hour)}</td><td class="num">${o.xr.toFixed(0)} km</td>
      <td class="num">${o.w.toFixed(0)} kt</td><td class="num">${o.ec.toExponential(1)}</td><td>${i === 0 ? '<span class="badge good">primary</span>' : i === 1 ? '<span class="badge info">backup</span>' : ""}</td></tr>`).join("");
  const p = good[0], b = good[1];
  document.getElementById("pkt").textContent = !p ? "No window satisfies all constraints. Relax one or extend the horizon." : [
    `REENTRY COORDINATION PACKET · W-Series capsule · rev ${Date.now() % 1000}`,
    `Primary: deorbit ${stamp(p.hour)} · landing ~35 min later · UTTR target`,
    `Backup:  ${b ? stamp(b.hour) : "none"}`, ``,
    `→ FAA/AST (Part 450 license): primary within licensed corridor. Cross-range ${p.xr.toFixed(0)} km,`,
    `  Ec ${p.ec.toExponential(1)} ≤ ${c.ec.toExponential(0)}. Request concurrence by ${stamp(p.hour - 96)}.`,
    `→ UTTR range scheduling: request hold ${stamp(p.hour - 2)} → ${stamp(p.hour + 2)} (+ backup).`,
    `→ Airspace: NOTAM filing due by ${stamp(p.hour - c.lead)}.`,
    `→ Recovery team: daylight landing confirmed; muster at ${stamp(p.hour - 4)}.`,
    `→ Ground stations: final state vector upload at ${stamp(p.hour - 6)}.`, ``,
    `Any stakeholder change re-runs this plan and re-issues the packet to everyone.`,
  ].join("\n");
}

function drawTimeline(all) {
  const cv = document.getElementById("tl");
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext("2d");
  g.scale(dpr, dpr);
  const L = 110, X = (h) => L + (h / (DAYS * 24)) * (W - L - 10);
  const rows = [["Range reserved", 20], ["Wind > limit", 60], ["Night", 100], ["Opportunities", 150]];
  g.font = "12px sans-serif";
  rows.forEach(([name, y]) => { g.fillStyle = "#646b78"; g.fillText(name, 0, y + 14); });
  g.fillStyle = "#fde8e8";
  rangeBlocks.forEach(([a, b]) => g.fillRect(X(a), 20, X(b) - X(a), 22));
  g.fillStyle = "#fff3de";
  wind.forEach((w, h) => { if (w > last.c.wind) g.fillRect(X(h), 60, X(h + 1) - X(h) + 0.5, 22); });
  g.fillStyle = "#e8ebf2";
  for (let h = 0; h < DAYS * 24; h++) {
    const lh = (((h + UTC_OFFSET_H) % 24) + 24) % 24;
    if (lh < 7.5 || lh > 16.5) g.fillRect(X(h), 100, X(h + 1) - X(h) + 0.5, 22);
  }
  all.forEach((o) => {
    g.fillStyle = o.ok ? "#12855a" : "#c3c8d1";
    g.fillRect(X(o.hour) - 1, o.ok ? 140 : 150, o.ok ? 3 : 2, o.ok ? 34 : 18);
  });
  if (last.good[0]) {
    const x = X(last.good[0].hour);
    g.strokeStyle = "#2f6bff"; g.lineWidth = 2; g.beginPath(); g.arc(x, 157, 13, 0, 7); g.stroke();
    g.fillStyle = "#2f6bff"; g.fillText("primary", x - 20, 190);
  }
  g.fillStyle = "#646b78";
  for (let d = 0; d <= DAYS; d += 2) g.fillText(`day ${d}`, X(d * 24) - 10, H - 8);
}

document.getElementById("plan").addEventListener("click", plan);
document.getElementById("deny").addEventListener("click", () => {
  const p = last.good[0];
  rangeBlocks = [...rangeBlocks, [p.hour - 3, p.hour + 3]];
  plan();
});

Demo.run({
  intro: { kicker: "Bottleneck 5 of 10 · Varda Space Industries", title: "A capsule waited eight months to come home",
    body: ["Varda's first capsule couldn't land until the FAA reentry license, the Air Force's Utah Test and Training Range and the recovery plan all lined up.",
      "Varda said it met the Part 450 requirements; the holdup was coordinating the reentry window. The FAA then started requiring reentry licenses before launch."],
    source: "Sources: theregister.com (Jun 2025) · payloadspace.com · spaceexplored.com" },
  outro: { kicker: "Result", title: "Every party works from the same live plan",
    bullets: ["~200 opportunities screened against range, weather, daylight, risk and lead-time limits", "Primary and backup picked with the reasons shown",
      "One packet tells the FAA, range, airspace, recovery and ground stations what they need and when", "A stakeholder change re-plans in a second"] },
}, [
  () => Demo.caption("Each stakeholder's constraint goes in once: cross-range, wind, the Part 450 public risk limit, NOTAM lead time, daylight."),
  () => Demo.highlight(".panel", 2800),
  () => Demo.click("#plan"),
  () => Demo.caption("Every deorbit opportunity over the next two weeks is checked against every constraint at once."),
  () => Demo.highlight("#tlbox", 3600),
  () => Demo.caption("The survivors are ranked, and one coordination packet goes to every party with their deadlines."),
  () => Demo.highlight("#out", 3800),
  () => Demo.caption("Now the range withdraws the primary window. Instead of weeks of email, it re-plans instantly."),
  () => Demo.click("#deny"),
  () => Demo.highlight("#out", 3600),
]);
