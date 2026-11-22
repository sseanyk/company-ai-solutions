// IntakeIQ: classify each received item from OCR'd label text plus dock measurements.

const MANIFEST = `ID   | label text (OCR)                                    | V_meas | T_C | visual            | kg
R-01 | LG INR18650 MJ1 3.6V 3500mAh (box of 400)            | 3.41   | 22  | ok                | 19.6
R-02 | CATL LFP prismatic 3.2V 280Ah                        | 3.29   | 21  | ok                | 5.4
R-03 | 2019 Model 3 SR+ battery pack 350V                   | 342    | 24  | ok                | 480
R-04 | Prius NiMH module 7.2V 6.5Ah                         | 7.6    | 20  | ok                | 1.0
R-05 | [label unreadable] pouch cell                        | 3.95   | 27  | swollen           | 0.9
R-06 | Samsung 21700 50E 3.6V (bulk)                        | 3.52   | 23  | ok                | 14.2
R-07 | e-bike pack 36V 10S4P Li-ion                         | 39.8   | 49  | scorch marks      | 3.1
R-08 | BYD Blade LFP module 3.2V                            | 3.31   | 22  | ok                | 18.0
R-09 | 12V VRLA sealed lead acid 7Ah                        | 12.7   | 20  | ok                | 2.1
R-10 | Nissan Leaf 24kWh module 7.4V 2P2S                   | 7.71   | 21  | ok                | 3.8
R-11 | laptop pack 11.1V 3S Li-ion                          | 0.4    | 22  | ok                | 0.3
R-12 | [no label] cylindrical cell, 18x65 mm                | 3.70   | 22  | ok                | 0.05
R-13 | Ford F-150 Lightning module NMC 3.7V                 | 3.96   | 23  | ok                | 32
R-14 | grid storage rack LiFePO4 48V 100Ah                  | 52.9   | 25  | dented casing     | 46`;

function chemistry(label, vPerCell) {
  if (/lead|VRLA|SLA|Pb/i.test(label)) return { chem: "Lead-acid", how: "label keyword" };
  if (/NiMH|Ni-MH/i.test(label)) return { chem: "NiMH", how: "label keyword" };
  if (/LFP|LiFePO4|Blade/i.test(label)) return { chem: "LFP", how: "label keyword" };
  if (/NMC|NCA|INR|MJ1|50E|Model 3|Leaf/i.test(label)) return { chem: "NMC/NCA", how: "label / model lookup" };
  if (/Li-?ion/i.test(label)) return { chem: "Li-ion (NMC likely)", how: "label keyword" };
  if (vPerCell >= 3.0 && vPerCell <= 3.4) return { chem: "LFP (inferred)", how: `inferred from ${vPerCell.toFixed(2)} V/cell` };
  if (vPerCell > 3.4 && vPerCell <= 4.3) return { chem: "NMC/NCA (inferred)", how: `inferred from ${vPerCell.toFixed(2)} V/cell` };
  return { chem: "Unknown", how: "no label, ambiguous voltage" };
}

function seriesCells(label, v) {
  const s = label.match(/(\d+)S/);
  if (s) return +s[1];
  const nominal = +(label.match(/([\d.]+)\s*V\b/) || [])[1];
  if (/LFP|LiFePO4|Blade/i.test(label) && nominal) return Math.max(1, Math.round(nominal / 3.2));
  if (nominal) return Math.max(1, Math.round(nominal / 3.65));
  return Math.max(1, Math.round(v / 3.65));
}

function format(label, kg) {
  if (/pack|rack/i.test(label) && kg > 100) return "EV / large pack";
  if (/pack|rack/i.test(label)) return "Pack";
  if (/module/i.test(label)) return "Module";
  if (/prismatic|Blade/i.test(label)) return "Prismatic cell";
  if (/pouch/i.test(label)) return "Pouch cell";
  if (/18650|21700|cylindrical|18x65/i.test(label)) return "Cylindrical cell";
  return "Unknown format";
}

function triage(row) {
  const { id, label, v, t, visual, kg } = row;
  const isLead = /lead|VRLA/i.test(label);
  const isNiMH = /NiMH/i.test(label);
  const s = isLead || isNiMH ? 1 : seriesCells(label, v);
  const vpc = v / s;
  const { chem, how } = chemistry(label, vpc);
  const fmt = format(label, kg);
  const reasons = [how];
  let hazard = "Standard", hz = "good";
  if (/swollen|scorch|leak|dent|damag/i.test(visual) || t > 45) {
    hazard = "Damaged / defective"; hz = "bad";
    reasons.push(`${visual}${t > 45 ? `, ${t} °C hot` : ""}: isolate, special packaging`);
  } else if (!isLead && !isNiMH && vpc > 3.9) {
    hazard = "High state of charge"; hz = "warn"; reasons.push(`${vpc.toFixed(2)} V/cell: discharge before processing`);
  } else if (!isLead && !isNiMH && vpc < 1.5) {
    hazard = "Deeply discharged"; hz = "info"; reasons.push(`${vpc.toFixed(2)} V/cell: no second life`);
  }
  let route;
  if (isLead) route = "Reject → lead-acid recycler";
  else if (isNiMH) route = "NiMH stream";
  else if (hz === "bad") route = "Quarantine bunker";
  else if (/Module|pack/i.test(fmt) && hz !== "info") route = "Second-life capacity test";
  else if (hz === "warn") route = "Discharge → recycle";
  else route = "Direct to recycling";
  return { id, label, chem, fmt, hazard, hz, route, reasons, s, vpc };
}

function parseManifest(text) {
  return text.split(/\r?\n/).slice(1).filter((l) => l.includes("|")).map((l) => {
    const [id, label, v, t, visual, kg] = l.split("|").map((x) => x.trim());
    return { id, label, v: +v, t: +t, visual, kg: +kg };
  });
}

const ROUTE_COLORS = { "Second-life capacity test": "#12855a", "Direct to recycling": "#2f6bff", "Discharge → recycle": "#b26a00",
  "Quarantine bunker": "#c62f2f", "NiMH stream": "#8a4fff", "Reject → lead-acid recycler": "#646b78" };

async function run() {
  const rows = parseManifest(document.getElementById("manifest").value);
  const feed = document.getElementById("feed");
  ["kpis", "out"].forEach((id) => document.getElementById(id).classList.remove("hidden"));
  feed.innerHTML = `<tr><th>ID</th><th>Chemistry</th><th>Format</th><th>Hazard</th><th>Route</th><th>Why</th></tr>`;
  const done = [];
  const t0 = performance.now();
  for (const r of rows) {
    const d = triage(r);
    done.push(d);
    feed.insertAdjacentHTML("beforeend", `<tr><td class="mono">${d.id}</td><td>${d.chem}</td><td>${d.fmt}</td>
      <td><span class="badge ${d.hz}">${d.hazard}</span></td><td><b style="color:${ROUTE_COLORS[d.route]}">${d.route}</b></td><td class="note">${Util.esc(d.reasons.join("; "))}</td></tr>`);
    renderSummary(done, rows.length, performance.now() - t0);
    await Demo.sleep(new URLSearchParams(location.search).has("demo") ? 260 : 60);
  }
}

function renderSummary(done, total, ms) {
  const counts = {};
  done.forEach((d) => { counts[d.route] = (counts[d.route] || 0) + 1; });
  document.getElementById("routes").innerHTML = Object.keys(ROUTE_COLORS).map((k) =>
    `<div class="route-bar"><span>${k}</span><div class="track"><div class="fill" style="width:${((counts[k] || 0) / total) * 100}%;background:${ROUTE_COLORS[k]}"></div></div><b>${counts[k] || 0}</b></div>`).join("");
  const hazards = done.filter((d) => d.hz === "bad");
  const unlabeled = done.filter((d) => /inferred/.test(d.chem));
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="v">${done.length}/${total}</div><div class="l">items triaged</div></div>
    <div class="kpi"><div class="v" style="color:var(--bad)">${hazards.length}</div><div class="l">hazards isolated before handling</div></div>
    <div class="kpi"><div class="v" style="color:var(--good)">${counts["Second-life capacity test"] || 0}</div><div class="l">sent to second-life test</div></div>
    <div class="kpi"><div class="v">${unlabeled.length}</div><div class="l">unlabeled items identified</div></div>`;
  document.getElementById("alerts").textContent = hazards.length
    ? `DOCK ALERTS\n${hazards.map((h) => `⚠ ${h.id} ${h.fmt}: ${h.reasons.slice(1).join("; ")} → move to quarantine bunker now`).join("\n")}`
    : "No dock alerts.";
}

document.getElementById("manifest").value = MANIFEST;
document.getElementById("run").addEventListener("click", run);

Demo.run({
  intro: { kicker: "Bottleneck 7 of 10 · Redwood Materials", title: "Every incoming battery is a different puzzle",
    body: ["Incoming batteries vary wildly in size, chemistry and enclosure, from consumer cells to whole EV packs. Live packs need fire-safe handling.",
      "Each item has to be tested to decide whether it goes to second-life storage or recycling. Redwood's own patents describe sensor-driven classification."],
    source: "Sources: leandesign.com facility tour · S&P Global (Redwood grid storage) · Redwood patents (justia)" },
  outro: { kicker: "Result", title: "Identified, risk-checked and routed at the dock",
    bullets: ["Unlabeled cells identified from voltage per cell", "Swollen and scorched items isolated before anyone handles them",
      "Packs and modules sent to second-life testing first", "Every decision comes with its reason, for audit and for retraining"] },
}, [
  () => Demo.caption("A mixed truckload: loose cells, EV packs and modules, a lead-acid battery, and items with no readable label."),
  () => Demo.highlight("#manifest", 2800),
  () => Demo.click("#run"),
  () => Demo.caption("Each item is classified as it's scanned: chemistry, format, hazard class and route."),
  () => Demo.sleep(2600),
  () => Demo.highlight("#feed", 3200),
  () => Demo.caption("Unlabeled cells are identified from their voltage per cell. The swollen pouch and the scorched e-bike pack trigger dock alerts."),
  () => Demo.highlight("#out .panel:last-child", 3600),
  () => Demo.caption("Healthy packs and modules go to second-life testing; everything else gets the right recycling stream."),
  () => Demo.highlight("#kpis", 2600),
]);
