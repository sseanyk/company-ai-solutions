// LicenseGap: check each required topic for the concepts a reviewer expects, look for
// quantitative support, and turn every gap into a predicted RAI with a fill-in outline.

const REQS = [
  { topic: "Accident analysis", title: "Event identification is systematic",
    concepts: { "method for selecting events (e.g. PRA, FMEA, PIRT)": /\b(PRA|probabilistic risk|FMEA|failure modes|PIRT|hazard analysis|event (sequence|tree))\b/i,
      "list of initiating events": /initiating event/i },
    rai: "Describe the systematic method used to identify initiating events and show that the list is complete." },
  { topic: "Accident analysis", title: "Bounding (maximum credible) event defined",
    concepts: { "bounding event named": /\b(maximum credible|bounding|limiting) (accident|event)\b/i, "why it bounds the others": /\b(bounds?|envelop(e|s))\b/i },
    rai: "Identify the bounding event and justify why its consequences envelop all other design-basis events." },
  { topic: "Accident analysis", title: "Dose consequences quantified",
    concepts: { "dose at site boundary / EAB": /\b(exclusion area boundary|EAB|site boundary)\b/i, "numeric dose with units": /\d+(\.\d+)?\s*(rem|mrem|Sv|mSv)\b/i, "source term": /source term/i },
    rai: "Provide the source term and calculated doses (with units) at the exclusion area boundary, compared with acceptance criteria." },
  { topic: "SSC classification", title: "Safety classification method",
    concepts: { "classification methodology": /\b(classification (method|methodology|process)|NEI 18-04|safety[- ]related criteria)\b/i, "safety-related SSCs listed": /safety[- ]related (SSCs?|structures|systems)/i },
    rai: "Describe the methodology used to classify SSCs as safety-related, and list the resulting safety-related SSCs." },
  { topic: "SSC classification", title: "Special treatment for safety-related SSCs",
    concepts: { "design / QA requirements tied to class": /\b(special treatment|quality assurance|QA program|ASME|10 CFR 50 Appendix B)\b/i },
    rai: "Explain the special treatment (codes, QA, testing) applied to each safety classification." },
  { topic: "Regulatory applicability", title: "Applicability of each regulation addressed",
    concepts: { "table of regulations and compliance approach": /\b(applicab(le|ility) of regulations|regulatory applicability|compliance (matrix|table))\b/i, "exemptions identified": /\bexemption/i },
    rai: "Provide a regulation-by-regulation applicability assessment, identifying any requested exemptions with justification." },
  { topic: "Design description", title: "Reactor and fuel described",
    concepts: { "fuel form": /\b(metal(lic)? fuel|HALEU|uranium[- ]zirconium|TRISO|UO2)\b/i, "power level": /\d+\s*(MWt|MWe|MW)\b/i, "heat removal path": /\b(heat pipes?|passive (heat|cooling)|decay heat removal)\b/i },
    rai: "Describe the fuel, rated thermal power and the decay-heat removal path in enough detail to support the safety analysis." },
  { topic: "Site & environment", title: "Site characteristics",
    concepts: { "meteorology / χ/Q": /\b(meteorolog|χ\/Q|chi\/Q|atmospheric dispersion)\b/i, "seismic": /\bseismic/i },
    rai: "Provide site meteorology (χ/Q) and seismic characterization used as inputs to the accident and structural analyses." },
];

const DRAFT = `## 1. Design description
The Microreactor-X is a 15 MWt sodium-free, heat-pipe-cooled fast reactor using HALEU metallic fuel (uranium-zirconium).
Decay heat removal is entirely passive: heat pipes conduct heat to the power conversion system and, on loss of load, to ambient air.

## 2. Site characteristics
The site is located on federal land with an existing exclusion area. Seismic hazard was characterized using the USGS 2023 hazard model.

## 3. Safety analysis
A hazard analysis was performed to identify initiating events, including loss of heat sink, reactivity insertion and external events.
The design is inherently safe and the consequences of all events are expected to be low.
Fuel temperatures remain below damage limits for the events analyzed.

## 4. Structures, systems and components
The reactor vessel, shutdown rods and heat pipes are important to the safe operation of the plant.
A quality assurance program meeting 10 CFR 50 Appendix B will be applied to the design.

## 5. Regulatory compliance
The applicant will comply with all applicable regulations.`;

function review(text) {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim() && !s.startsWith("##"));
  return REQS.map((r) => {
    const found = Object.entries(r.concepts).map(([name, re]) => {
      const hit = sentences.find((s) => re.test(s));
      return { name, hit: hit ? hit.replace(re, (m) => `\u0001${m}\u0002`) : null };
    });
    const got = found.filter((f) => f.hit).length;
    const status = got === found.length ? "Covered" : got === 0 ? "Missing" : "Partial";
    return { ...r, found, status, score: got / found.length };
  });
}

// Statements that read as conclusions without support, which reviewers routinely push back on.
const UNSUPPORTED = [/inherently safe/i, /expected to be low/i, /will comply with all applicable/i, /important to the safe operation/i];

function run() {
  const text = document.getElementById("doc").value;
  const res = review(text);
  const flags = text.split(/(?<=[.!?])\s+|\n+/).filter((s) => UNSUPPORTED.some((re) => re.test(s)));
  const by = (s) => res.filter((r) => r.status === s).length;
  ["sumbox", "kpis", "matbox", "raibox"].forEach((id) => document.getElementById(id).classList.remove("hidden"));
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="v">${res.length}</div><div class="l">reviewer expectations checked</div></div>
    <div class="kpi"><div class="v" style="color:var(--good)">${by("Covered")}</div><div class="l">covered</div></div>
    <div class="kpi"><div class="v" style="color:var(--warn)">${by("Partial")}</div><div class="l">partial</div></div>
    <div class="kpi"><div class="v" style="color:var(--bad)">${by("Missing")}</div><div class="l">missing → likely RAI</div></div>
    <div class="kpi"><div class="v">${flags.length}</div><div class="l">unsupported conclusions</div></div>`;

  const topics = [...new Set(res.map((r) => r.topic))];
  drawBars(topics.map((t) => {
    const rs = res.filter((r) => r.topic === t);
    return { label: t, value: rs.reduce((s, r) => s + r.score, 0) / rs.length };
  }));

  const hl = (s) => Util.esc(s).replace(/\u0001/g, "<mark>").replace(/\u0002/g, "</mark>");
  document.getElementById("matrix").innerHTML = `<tr><th>Expectation</th><th>Status</th><th>Concepts and evidence found in draft</th></tr>` +
    res.map((r) => `<tr class="req-row"><td><b>${r.topic}</b><br>${r.title}</td>
      <td><span class="badge ${r.status === "Covered" ? "good" : r.status === "Partial" ? "warn" : "bad"}">${r.status}</span></td>
      <td>${r.found.map((f) => `<div>${f.hit ? "✓" : "✗"} ${f.name}${f.hit ? `<div class="ev">“${hl(f.hit.trim())}”</div>` : ""}</div>`).join("")}</td></tr>`).join("");

  const gaps = res.filter((r) => r.status !== "Covered");
  document.getElementById("rai").textContent = [
    `PREDICTED REQUESTS FOR ADDITIONAL INFORMATION · ${gaps.length} items`, "",
    ...gaps.map((g, i) => [`RAI-${String(i + 1).padStart(2, "0")} [${g.topic}] ${g.title}`, `  Question: ${g.rai}`,
      `  Missing: ${g.found.filter((f) => !f.hit).map((f) => f.name).join("; ")}`,
      `  Fill-in outline: (1) method and assumptions, (2) results table with units, (3) acceptance criteria, (4) references to supporting calcs`, ""].join("\n")),
    "UNSUPPORTED CONCLUSIONS (state the basis or remove):",
    ...flags.map((f) => `  • “${f.trim()}”`),
  ].join("\n");
}

function drawBars(items) {
  const cv = document.getElementById("bars");
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext("2d");
  g.scale(dpr, dpr);
  const rowH = (H - 10) / items.length;
  items.forEach((it, i) => {
    const y = 6 + i * rowH;
    g.fillStyle = "#16181d"; g.font = "12px sans-serif"; g.fillText(it.label, 0, y + 14);
    g.fillStyle = "#eef0f3"; g.fillRect(0, y + 22, W - 50, 16);
    g.fillStyle = it.value >= 0.99 ? "#12855a" : it.value > 0.4 ? "#b26a00" : "#c62f2f";
    g.fillRect(0, y + 22, (W - 50) * it.value, 16);
    g.fillStyle = "#16181d"; g.fillText(`${Math.round(it.value * 100)}%`, W - 42, y + 35);
  });
}

document.getElementById("doc").value = DRAFT;
document.getElementById("run").addEventListener("click", run);

Demo.run({
  intro: { kicker: "Bottleneck 4 of 10 · Oklo", title: "License applications denied for information gaps",
    body: ["In January 2022 the NRC denied Oklo's Aurora combined license application. It cited significant gaps in the description of potential accidents and in the classification of safety systems and components.",
      "Supplements filed in July and October 2021 still didn't close them. Every round trip with the NRC costs months."],
    source: "Sources: NRC press release ML22006A267 · world-nuclear-news.org" },
  outro: { kicker: "Result", title: "Gaps found before the NRC finds them",
    bullets: ["Every expectation traced to the exact sentence that satisfies it", "Missing accident doses and SSC classification method caught",
      "\"Inherently safe\"-style unsupported claims flagged", "Each gap becomes a predicted RAI with a fill-in outline"] },
}, [
  () => Demo.caption("A draft application section set (synthetic) is pasted in."),
  () => Demo.highlight("#doc", 2600),
  () => Demo.click("#run"),
  () => Demo.caption("Coverage by topic: the design description is solid, but accident analysis and SSC classification are thin."),
  () => Demo.highlight("#sumbox", 3400),
  () => Demo.caption("Every finding cites the sentence that satisfies it, so reviewers can check the tool's work."),
  () => Demo.highlight("#matbox", 4200),
  () => Demo.caption("Each gap turns into the RAI the NRC is likely to send, plus an outline of what to write."),
  () => Demo.highlight("#raibox", 4200),
]);
