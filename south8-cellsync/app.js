// CellSync: detect a cycler export's schema, normalize units, merge cells, flag anomalies.

const FIELD_PATTERNS = {
  cycle: [/^cyc(le)?[\s_#-]*(index|id|no|number|#)?$/i, /^cycle$/i, /^cyc#$/i],
  discharge: [/dis(charge|chg)?[\s_.-]*cap/i, /^dcap/i, /^d[\s_-]?cap/i],
  charge: [/^(charge|chg)[\s_.-]*cap/i, /^ccap/i, /^c[\s_-]?cap/i],
  temp: [/temp/i, /^t\(?c\)?$/i],
};

function detectUnit(header) {
  if (/mah/i.test(header)) return { unit: "mAh", factor: 1 };
  if (/ah/i.test(header)) return { unit: "Ah", factor: 1000 };
  return { unit: "mAh (assumed)", factor: 1 };
}

function splitLine(line) {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(";")) return line.split(";");
  return line.split(",");
}

function parseExport(name, text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
  if (lines.length < 3) throw new Error(`${name}: not enough rows`);
  const headers = splitLine(lines[0]).map((h) => h.trim());
  const map = {};
  for (const [field, pats] of Object.entries(FIELD_PATTERNS)) {
    const idx = headers.findIndex((h) => pats.some((p) => p.test(h)));
    if (idx >= 0) map[field] = { idx, header: headers[idx], ...detectUnit(headers[idx]) };
  }
  if (!map.cycle || !map.discharge) throw new Error(`${name}: could not find cycle and discharge columns`);
  const rows = lines.slice(1).map((l) => {
    const c = splitLine(l);
    const num = (f) => (map[f] ? parseFloat(c[map[f].idx]) * (map[f].factor || 1) : NaN);
    return { cycle: parseFloat(c[map.cycle.idx]), dcap: num("discharge"), ccap: num("charge"),
      temp: map.temp ? parseFloat(c[map.temp.idx]) : NaN };
  }).filter((r) => Number.isFinite(r.cycle) && Number.isFinite(r.dcap));
  const brand = /Cycle_Index/.test(lines[0]) ? "Arbin-style" : /Cyc#/.test(lines[0]) ? "Maccor-style"
    : /Cycle ID/.test(lines[0]) ? "Neware-style" : "Unknown (auto-mapped)";
  return { name, brand, map, rows };
}

function analyze(cell) {
  const base = cell.rows.slice(0, 3).reduce((s, r) => s + r.dcap, 0) / Math.min(3, cell.rows.length);
  const pts = cell.rows.map((r) => ({ ...r, ret: (100 * r.dcap) / base, ce: r.ccap ? (100 * r.dcap) / r.ccap : NaN }));
  // Linear fade fit on retention vs cycle (least squares)
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.cycle, 0) / n;
  const my = pts.reduce((s, p) => s + p.ret, 0) / n;
  const slope = pts.reduce((s, p) => s + (p.cycle - mx) * (p.ret - my), 0) /
    pts.reduce((s, p) => s + (p.cycle - mx) ** 2, 0);
  const intercept = my - slope * mx;
  const eol80 = slope < 0 ? (80 - intercept) / slope : Infinity;
  // Anomalies: robust z-score of cycle-to-cycle capacity jumps, plus coulombic efficiency dips
  const diffs = pts.slice(1).map((p, i) => p.ret - pts[i].ret);
  const med = [...diffs].sort((a, b) => a - b)[Math.floor(diffs.length / 2)];
  const mad = [...diffs.map((d) => Math.abs(d - med))].sort((a, b) => a - b)[Math.floor(diffs.length / 2)] || 0.01;
  const anomalies = [];
  diffs.forEach((d, i) => {
    const z = (d - med) / (1.4826 * mad);
    if (Math.abs(z) > 8) anomalies.push({ cycle: pts[i + 1].cycle, kind: d < 0 ? "Sudden capacity drop" : "Capacity jump (likely tester restart / recal)",
      detail: `${d.toFixed(2)} pts in one cycle (z = ${z.toFixed(0)})` });
  });
  pts.forEach((p) => {
    if (Number.isFinite(p.ce) && p.ce < 98.5) anomalies.push({ cycle: p.cycle, kind: "Low coulombic efficiency", detail: `CE ${p.ce.toFixed(2)} %` });
    if (Number.isFinite(p.temp) && p.temp > 35) anomalies.push({ cycle: p.cycle, kind: "Chamber temperature excursion", detail: `${p.temp.toFixed(1)} °C` });
  });
  return { ...cell, pts, base, slope, eol80, anomalies: dedupe(anomalies) };
}

// Collapse runs of the same finding (e.g. five hot cycles in a row) into one row.
function dedupe(list) {
  const lastByKind = new Map();
  return [...list].sort((a, b) => a.cycle - b.cycle).filter((a) => {
    const prev = lastByKind.get(a.kind);
    lastByKind.set(a.kind, a.cycle);
    return prev === undefined || a.cycle - prev > 6;
  });
}

// ---------- synthetic exports ----------
function synth() {
  const r = Util.rng(8);
  const arbin = ["Cycle_Index,Test_Time(s),Charge_Capacity(Ah),Discharge_Capacity(Ah),Aux_Temperature(C)"];
  const maccor = ["Cyc#\tStep\tCCap(mAh)\tDCap(mAh)\tTemp(C)"];
  const neware = ["Cycle ID;Charge Cap.(mAh);Discharge Cap.(mAh)"];
  for (let c = 1; c <= 300; c++) {
    const a = 3.0 * (1 - 0.00042 * c - 0.0000004 * c * c) + (r() - 0.5) * 0.004;
    arbin.push(`${c},${c * 7200},${(a / 0.9993).toFixed(4)},${a.toFixed(4)},${(25 + (r() - 0.5)).toFixed(1)}`);
    const temp = c >= 205 && c <= 209 ? 38.5 + r() : 25 + (r() - 0.5);
    const m = 2950 * (1 - 0.00078 * c) + (r() - 0.5) * 4;
    const ceM = c >= 205 && c <= 209 ? 0.978 : 0.9991;
    maccor.push(`${c}\t4\t${(m / ceM).toFixed(1)}\t${m.toFixed(1)}\t${temp.toFixed(1)}`);
    let nw = 3010 * (1 - 0.0005 * c) + (r() - 0.5) * 4;
    if (c >= 142) nw -= 95; // sudden drop: lithium plating / contact issue
    neware.push(`${c};${(nw / 0.9992).toFixed(1)};${nw.toFixed(1)}`);
  }
  return [
    { name: "cell_A_arbin.csv", text: arbin.join("\n") },
    { name: "cell_B_maccor.txt", text: maccor.join("\n") },
    { name: "cell_C_neware.csv", text: neware.join("\n") },
  ];
}

const filesEl = document.getElementById("files");
let files = synth();
let harmonized = [];

function renderFiles() {
  filesEl.innerHTML = "";
  files.forEach((f, i) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = `<div class="mono" style="margin-bottom:4px"><b>${Util.esc(f.name)}</b></div>`;
    const ta = document.createElement("textarea");
    ta.rows = 7;
    ta.value = f.text;
    ta.addEventListener("input", () => { files[i] = { ...f, text: ta.value }; });
    wrap.appendChild(ta);
    filesEl.appendChild(wrap);
  });
}

document.getElementById("upload").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  files = [...files, { name: f.name, text: await f.text() }];
  renderFiles();
});

function run() {
  const colors = ["#2f6bff", "#12855a", "#c62f2f", "#8a4fff", "#b26a00"];
  const errors = [];
  harmonized = files.flatMap((f) => {
    try { return [analyze(parseExport(f.name, f.text))]; } catch (err) { errors.push(err.message); return []; }
  });
  document.getElementById("maptable").innerHTML =
    `<tr><th>File</th><th>Detected format</th><th>Cycle col</th><th>Discharge col → unit</th><th>Charge col</th><th>Temp col</th></tr>` +
    harmonized.map((c) => `<tr><td class="mono">${Util.esc(c.name)}</td><td><span class="badge info">${c.brand}</span></td>
      <td class="mono">${Util.esc(c.map.cycle.header)}</td>
      <td class="mono">${Util.esc(c.map.discharge.header)} → ${c.map.discharge.unit}${c.map.discharge.factor > 1 ? " ×1000" : ""}</td>
      <td class="mono">${c.map.charge ? Util.esc(c.map.charge.header) : "—"}</td>
      <td class="mono">${c.map.temp ? Util.esc(c.map.temp.header) : "—"}</td></tr>`).join("") +
    errors.map((e) => `<tr><td colspan="6"><span class="badge bad">Error</span> ${Util.esc(e)}</td></tr>`).join("");

  const totalRows = harmonized.reduce((s, c) => s + c.rows.length, 0);
  const totalAnoms = harmonized.reduce((s, c) => s + c.anomalies.length, 0);
  const worst = [...harmonized].sort((a, b) => a.eol80 - b.eol80)[0];
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="v">${harmonized.length}</div><div class="l">files merged, 3 formats</div></div>
    <div class="kpi"><div class="v">${Util.fmt(totalRows)}</div><div class="l">cycles normalized to mAh</div></div>
    <div class="kpi"><div class="v">${totalAnoms}</div><div class="l">anomalies flagged</div></div>
    <div class="kpi"><div class="v">${worst ? Util.fmt(worst.eol80) : "—"}</div><div class="l">cycles to 80% (worst cell)</div></div>`;

  ["mapping", "kpis", "results", "reportbox"].forEach((id) => document.getElementById(id).classList.remove("hidden"));
  Util.lineChart(document.getElementById("chart"), harmonized.map((c, i) => ({
    name: c.name.split("_").slice(0, 2).join(" "), color: colors[i % colors.length],
    points: c.pts.map((p) => [p.cycle, p.ret]),
    marks: c.anomalies.filter((a) => a.kind.startsWith("Sudden")).map((a) => [a.cycle, c.pts.find((p) => p.cycle === a.cycle).ret]),
  })), { xLabel: "cycle", yLabel: "retention %", hLines: [{ y: 80, label: "80% end of life" }] });

  document.getElementById("anoms").innerHTML = `<tr><th>Cell</th><th class="num">Cycle</th><th>Finding</th><th>Detail</th></tr>` +
    harmonized.flatMap((c) => c.anomalies.map((a) => `<tr><td class="mono">${Util.esc(c.name.split("_").slice(0, 2).join(" "))}</td>
      <td class="num">${a.cycle}</td><td><span class="badge ${a.kind.startsWith("Sudden") ? "bad" : "warn"}">${a.kind}</span></td><td>${a.detail}</td></tr>`)).join("");

  document.getElementById("report").textContent = buildReport();
}

function buildReport() {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [`CYCLE-LIFE STATUS REPORT · generated ${today}`, ""];
  for (const c of harmonized) {
    const last = c.pts[c.pts.length - 1];
    lines.push(`${c.name}  [${c.brand}]`);
    lines.push(`  Initial capacity ${c.base.toFixed(0)} mAh · now ${last.dcap.toFixed(0)} mAh at cycle ${last.cycle} (${last.ret.toFixed(1)} %)`);
    lines.push(`  Linear fade ${(-c.slope * 100).toFixed(3)} %/100 cycles · projected 80 % at cycle ${Number.isFinite(c.eol80) ? c.eol80.toFixed(0) : "n/a"}`);
    if (c.anomalies.length) c.anomalies.forEach((a) => lines.push(`  ⚠ cycle ${a.cycle}: ${a.kind} (${a.detail})`));
    else lines.push("  No anomalies.");
    lines.push("");
  }
  lines.push("Recommended actions:");
  harmonized.forEach((c) => {
    if (c.anomalies.some((a) => a.kind.startsWith("Sudden"))) lines.push(`  • ${c.name}: inspect cell/fixture contacts; consider teardown for plating.`);
    if (c.anomalies.some((a) => a.kind.includes("temperature"))) lines.push(`  • ${c.name}: chamber excursion, so exclude those cycles from the fade fit and check chamber logs.`);
  });
  return lines.join("\n");
}

document.getElementById("run").addEventListener("click", run);
document.getElementById("dl").addEventListener("click", () => {
  const out = ["cell,source_format,cycle,discharge_mAh,charge_mAh,retention_pct,ce_pct,temp_C"];
  harmonized.forEach((c) => c.pts.forEach((p) => out.push([c.name, c.brand, p.cycle, p.dcap.toFixed(1),
    Number.isFinite(p.ccap) ? p.ccap.toFixed(1) : "", p.ret.toFixed(3), Number.isFinite(p.ce) ? p.ce.toFixed(3) : "",
    Number.isFinite(p.temp) ? p.temp : ""].join(","))));
  Util.download("harmonized_cells.csv", out.join("\n"), "text/csv");
});
renderFiles();

Demo.run({
  intro: { kicker: "Bottleneck 1 of 10 · South 8 Technologies", title: "Battery test data takes weeks to analyze",
    body: ["South 8's engineers found it hard to collect, clean, access and share test data, according to a Voltaiq case study.",
      "Labs mix cycler brands, and each one exports different columns and units, so the stitching gets done by hand in spreadsheets."],
    source: "Sources: voltaiq.com/south-8 · voltaiq.com/test-labs" },
  outro: { kicker: "Result", title: "Three formats merged in about 1 second",
    bullets: ["Columns and units detected without templates", "End-of-life projected per cell",
      "Plating-like drop and chamber excursion caught at the cycle they happened", "The report writes itself; the data downloads as one tidy CSV"] },
}, [
  () => Demo.caption("Three raw exports from three different cycler brands, each with its own headers and units."),
  () => Demo.highlight("#files", 2600),
  () => Demo.click("#run"),
  () => Demo.caption("It works out which column is which, and spots that Arbin reports in Ah rather than mAh."),
  () => Demo.highlight("#mapping", 3000),
  () => Demo.caption("All cells now sit on one retention axis, with end-of-life projected for each."),
  () => Demo.highlight("#results .panel", 3200),
  () => Demo.caption("Anomalies are flagged at the exact cycle: a sudden drop on cell C, a temperature excursion on cell B."),
  () => Demo.highlight("#anoms", 3200),
  () => Demo.caption("The status report is written automatically. Nobody touches a spreadsheet."),
  () => Demo.highlight("#reportbox", 3400),
]);
