// AutoBalloon: find dimension callouts on a drawing, classify them, place balloons,
// then match CMM results and build the AS9102 Form 3 table.

const NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("dwg");

// --- the drawing: geometry, dimension lines, callouts, title block ---
const GEO = `
  <rect class="geo" x="90" y="70" width="460" height="230" rx="4"/>
  <circle class="geo" cx="170" cy="150" r="22"/>
  <circle class="geo" cx="130" cy="110" r="8"/><circle class="geo" cx="510" cy="110" r="8"/>
  <circle class="geo" cx="130" cy="260" r="8"/><circle class="geo" cx="510" cy="260" r="8"/>
  <rect class="geo" x="300" y="140" width="160" height="60" rx="30"/>
  <line class="dimline" x1="90" y1="330" x2="550" y2="330"/><line class="dimline" x1="90" y1="305" x2="90" y2="336"/><line class="dimline" x1="550" y1="305" x2="550" y2="336"/>
  <line class="dimline" x1="575" y1="70" x2="575" y2="300"/><line class="dimline" x1="555" y1="70" x2="581" y2="70"/><line class="dimline" x1="555" y1="300" x2="581" y2="300"/>
  <line class="dimline" x1="192" y1="150" x2="245" y2="110"/>
  <line class="dimline" x1="300" y1="215" x2="460" y2="215"/>
  <g class="tb"><rect x="640" y="250" width="240" height="120" fill="none" stroke="#999"/>
    <text x="650" y="270">PART: HB-2207 BRACKET</text><text x="650" y="288">MATL: AL 7075-T7351</text>
    <text x="650" y="306">DWG REV: C   SCALE 1:1</text><text x="650" y="324">UNLESS NOTED: .XX ±0.10 mm</text>
    <text x="650" y="342">DO NOT SCALE DRAWING</text><text x="650" y="360">SHEET 1 OF 1</text></g>`;
const CALLOUTS = [
  { x: 270, y: 350, t: "114.30 ±0.10" },
  { x: 590, y: 190, t: "57.15 ±0.10" },
  { x: 250, y: 104, t: "Ø22.225 +0.025/-0.000" },
  { x: 250, y: 122, t: "⌖ Ø0.05 | A | B" },
  { x: 80, y: 92, t: "4X Ø6.60 THRU" },
  { x: 330, y: 235, t: "40.00 ±0.05" },
  { x: 330, y: 132, t: "R15.00" },
  { x: 610, y: 95, t: "▱ 0.03" },
  { x: 610, y: 125, t: "Ra 1.6 MAX" },
  { x: 610, y: 155, t: "THK 12.70 ±0.05" },
];
const DEFAULT_TOL = 0.1;

function drawDrawing() {
  svg.innerHTML = GEO + CALLOUTS.map((c) => `<text x="${c.x}" y="${c.y}">${Util.esc(c.t)}</text>`).join("");
}

// Classify one text string into an inspectable characteristic, or null if it is not one.
function classify(text) {
  const t = text.trim();
  let m;
  const qty = (m = t.match(/^(\d+)X\s+/)) ? +m[1] : 1;
  const body = t.replace(/^\d+X\s+/, "");
  if ((m = body.match(/^⌖\s*Ø?([\d.]+)\s*\|\s*(.+)$/))) return { type: "True position", nominal: 0, lsl: null, usl: +m[1], qty, datums: m[2].replace(/\s/g, "") };
  if ((m = body.match(/^▱\s*([\d.]+)/))) return { type: "Flatness", nominal: 0, lsl: null, usl: +m[1], qty };
  if ((m = body.match(/^Ra\s*([\d.]+)/i))) return { type: "Surface finish (µm)", nominal: null, lsl: null, usl: +m[1], qty };
  const isDia = body.startsWith("Ø");
  const isRad = body.startsWith("R");
  const num = body.replace(/^(Ø|R|THK\s*)/, "");
  if ((m = num.match(/^([\d.]+)\s*±\s*([\d.]+)/))) return { type: isDia ? "Diameter" : "Linear", nominal: +m[1], lsl: +m[1] - +m[2], usl: +m[1] + +m[2], qty };
  if ((m = num.match(/^([\d.]+)\s*\+([\d.]+)\s*\/\s*-([\d.]+)/))) return { type: isDia ? "Diameter" : "Linear", nominal: +m[1], lsl: +m[1] - +m[3], usl: +m[1] + +m[2], qty };
  if ((m = num.match(/^([\d.]+)(\s+THRU)?$/))) {
    const n = +m[1];
    return { type: isDia ? "Diameter (title-block tol)" : isRad ? "Radius (title-block tol)" : "Linear (title-block tol)", nominal: n, lsl: n - DEFAULT_TOL, usl: n + DEFAULT_TOL, qty };
  }
  return null;
}

let chars = [];

function balloon() {
  drawDrawing();
  chars = [];
  const texts = [...svg.querySelectorAll(":scope > text")];
  let n = 0;
  texts.forEach((el, i) => {
    const c = classify(el.textContent);
    if (!c) return;
    const box = el.getBBox();
    for (let k = 0; k < c.qty; k++) {
      n += 1;
      const id = c.qty > 1 ? `${n}` : `${n}`;
      chars.push({ id, req: el.textContent + (c.qty > 1 ? ` (hole ${k + 1} of ${c.qty})` : ""), ...c });
    }
    const label = c.qty > 1 ? `${n - c.qty + 1}-${n}` : `${n}`;
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "balloon");
    g.dataset.first = n - c.qty + 1;
    g.dataset.last = n;
    g.style.animationDelay = `${i * 0.12}s`;
    const r = label.length > 2 ? 15 : 11;
    const cx = box.x - r - 4, cy = box.y + box.height / 2;
    g.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}"/><text x="${cx}" y="${cy + 4}">${label}</text>`;
    svg.appendChild(g);
  });
  const ignored = texts.length - new Set(chars.map((c) => c.req.replace(/ \(hole.*$/, ""))).size + document.querySelectorAll("#dwg .tb text").length;
  document.getElementById("chars").innerHTML = `<tr><th>#</th><th>Requirement</th><th>Type</th><th class="num">LSL</th><th class="num">USL</th></tr>` +
    chars.map((c) => `<tr><td>${c.id}</td><td class="mono">${Util.esc(c.req)}</td><td>${c.type}</td><td class="num">${c.lsl == null ? "—" : c.lsl.toFixed(3)}</td><td class="num">${c.usl.toFixed(3)}</td></tr>`).join("") +
    `<tr><td colspan="5" class="note">Title block and notes recognized as non-inspectable (${ignored} text items skipped). Untoleranced dims got the title-block ±${DEFAULT_TOL} mm.</td></tr>`;
  document.getElementById("cmm").value = sampleCmm();
  ["cmmbox", "charbox"].forEach((id) => document.getElementById(id).classList.remove("hidden"));
}

function sampleCmm() {
  const r = Util.rng(22);
  const lines = ["PC-DMIS-style report · HB-2207 SN 0001 · 2026-11-20 09:42", "FEATURE        AXIS   MEAS"];
  chars.forEach((c, i) => {
    let meas;
    if (c.nominal == null) meas = c.usl * (0.4 + 0.4 * r());
    else if (c.nominal === 0) meas = c.usl * (0.2 + 0.6 * r());
    else meas = (c.lsl + c.usl) / 2 + (c.usl - c.lsl) * (r() - 0.5) * 0.6;
    if (c.req.startsWith("40.00")) meas = 40.071; // the one out-of-tolerance slot width
    lines.push(`FEAT_${String(i + 1).padStart(2, "0")}        ${c.type.startsWith("Diam") ? "D " : c.nominal === 0 || c.nominal == null ? "T " : "L "}     ${meas.toFixed(4)}`);
  });
  return lines.join("\n");
}

function merge() {
  const meas = {};
  document.getElementById("cmm").value.split(/\r?\n/).forEach((l) => {
    const m = l.match(/FEAT_(\d+)\s+\S+\s+(-?[\d.]+)/);
    if (m) meas[+m[1]] = +m[2];
  });
  const rows = chars.map((c, i) => {
    const v = meas[i + 1];
    const ok = v != null && (c.lsl == null || v >= c.lsl - 1e-9) && v <= c.usl + 1e-9;
    return { ...c, v, ok, missing: v == null };
  });
  const fails = rows.filter((r) => !r.ok);
  document.getElementById("form3").innerHTML = `<tr><th>Char No.</th><th>Reference location</th><th>Characteristic designator</th><th>Requirement</th><th class="num">Result</th><th>Tool</th><th>Status</th></tr>` +
    rows.map((r) => `<tr><td>${r.id}</td><td>Sheet 1</td><td>${r.type}</td><td class="mono">${Util.esc(r.req)}</td>
      <td class="num">${r.missing ? "—" : r.v.toFixed(4)}</td><td>${r.type.startsWith("Surface") ? "Profilometer" : "CMM"}</td>
      <td>${r.missing ? '<span class="badge warn">No data</span>' : r.ok ? '<span class="badge good">Conforms</span>' : '<span class="badge bad">Nonconforming</span>'}</td></tr>`).join("");
  svg.querySelectorAll(".balloon").forEach((g) => {
    const bad = fails.some((f) => +f.id >= +g.dataset.first && +f.id <= +g.dataset.last);
    g.classList.toggle("fail", bad);
  });
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="v">${rows.length}</div><div class="l">characteristics ballooned</div></div>
    <div class="kpi"><div class="v">${rows.length - fails.length}</div><div class="l">conforming</div></div>
    <div class="kpi"><div class="v" style="color:var(--bad)">${fails.length}</div><div class="l">nonconforming</div></div>
    <div class="kpi"><div class="v">~4 min</div><div class="l">vs 40+ h reported manually</div></div>`;
  document.getElementById("ncr").textContent = fails.length
    ? fails.map((f) => [`NCR DRAFT · HB-2207 Rev C · SN 0001`, `Characteristic ${f.id}: ${f.req}`,
      `Measured ${f.v.toFixed(4)} mm; limits ${f.lsl?.toFixed(3) ?? "—"} to ${f.usl.toFixed(3)} mm (${f.v > f.usl ? `over by ${(f.v - f.usl).toFixed(4)}` : `under by ${(f.lsl - f.v).toFixed(4)}`} mm)`,
      `Likely cause: slot finishing pass. Check tool wear offset on T12 / CAM stock-to-leave.`,
      `Disposition: pending MRB. Hold FAI sign-off until rework or a customer concession.`].join("\n")).join("\n\n")
    : "All characteristics conform. FAI ready for sign-off.";
  ["kpis", "formbox", "ncrbox"].forEach((id) => document.getElementById(id).classList.remove("hidden"));
  window.__form3 = rows;
}

drawDrawing();
document.getElementById("balloon").addEventListener("click", balloon);
document.getElementById("merge").addEventListener("click", merge);
document.getElementById("dl").addEventListener("click", () => {
  const out = ["char_no,designator,requirement,lsl,usl,result,status"];
  (window.__form3 || []).forEach((r) => out.push([r.id, r.type, `"${r.req}"`, r.lsl ?? "", r.usl, r.v ?? "", r.ok ? "conforms" : "nonconforming"].join(",")));
  Util.download("HB-2207_Form3.csv", out.join("\n"), "text/csv");
});

Demo.run({
  intro: { kicker: "Bottleneck 3 of 10 · Hadrian", title: "First-article inspection paperwork",
    body: ["Aerospace parts need an AS9102 first-article report: every dimension is numbered on the drawing, listed in Form 3, and matched to a measurement.",
      "It's done by hand. Suppliers have reported 40+ hours per part, and Hadrian's pitch is that the factory itself is the product, so manual steps like this are what it automates."],
    source: "Sources: qualitymag.com (AS9102 FAI) · techcrunch.com (Hadrian, Feb 2024)" },
  outro: { kicker: "Result", title: "Drawing to signed-off Form 3 in minutes",
    bullets: ["All 13 characteristics found, including the 4X pattern and GD&T callouts", "Title block ignored, title-block tolerance applied where needed",
      "CMM output matched automatically", "Out-of-tolerance slot flagged on the drawing with an NCR draft"] },
}, [
  () => Demo.caption("The customer's drawing arrives: dimensions, GD&T callouts and notes, none of them numbered yet."),
  () => Demo.highlight("#dwg", 2600),
  () => Demo.click("#balloon"),
  () => Demo.caption("Every inspectable callout gets a balloon. The 4X hole pattern becomes four separate characteristics."),
  () => Demo.highlight("#dwg", 3200),
  () => Demo.caption("Tolerances are parsed into limits, including asymmetric ones, GD&T, and title-block defaults."),
  () => Demo.highlight("#charbox", 3200),
  () => Demo.caption("The raw CMM report is pasted in as-is."),
  () => Demo.click("#merge"),
  () => Demo.caption("Form 3 fills itself. One slot width is out of tolerance, and it's flagged."),
  () => Demo.highlight("#formbox", 3400),
  () => Demo.caption("The failing balloon turns red on the drawing, and a nonconformance report is drafted for review."),
  () => Demo.highlight("#dwg", 2600),
  () => Demo.highlight("#ncrbox", 2800),
]);
