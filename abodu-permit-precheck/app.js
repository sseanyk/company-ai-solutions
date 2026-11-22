// PermitPrecheck: evaluate a detached ADU against the city's rules, but clamp each local
// rule to the state floor, and separate "fix the plans" from "the city can't require this".

const STATE = {
  maxHeightMin: (transit) => (transit <= 0.5 ? 18 : 16),     // locals may not cap below this
  setbackMax: 4,                                              // locals may not require more than 4 ft side/rear
  sizeAllowedMin: (beds) => (beds >= 2 ? 1000 : 850),         // locals must allow at least this size
  parkingExemptMi: 0.5,                                       // no parking within 1/2 mile of transit
  sprinklerOnlyIfPrimary: true,
  reviewDays: 60,
};
const CITIES = {
  "Coastal City (pre-approved plan program)": { height: 16, side: 4, rear: 4, maxSize: 1200, parking: 0, sprinklers: false, slopeSoilsPct: 20, extraDocs: [] },
  "Valley City": { height: 16, side: 4, rear: 4, maxSize: 1000, parking: 1, sprinklers: false, slopeSoilsPct: 15, extraDocs: ["Utility will-serve letter"] },
  "Hillside City": { height: 14, side: 10, rear: 10, maxSize: 750, parking: 1, sprinklers: true, slopeSoilsPct: 15, extraDocs: ["Fire access plan", "Tree survey"] },
};
const BASE_DOCS = ["Site plan", "Floor plan", "Elevations", "Title 24 energy report", "Structural calcs", "Soils report", "Fire access plan", "Tree survey", "Utility will-serve letter"];
const MODELS = { studio: { size: 340, beds: 0 }, "2br": { size: 800, beds: 2 } };

function rulesText(c) {
  return [`Max ADU height: ${c.height} ft`, `Side setback: ${c.side} ft`, `Rear setback: ${c.rear} ft`, `Max ADU size: ${c.maxSize} sq ft`,
    `Parking: ${c.parking} space(s) per ADU`, `Fire sprinklers in ADU: ${c.sprinklers ? "required" : "only if primary has them"}`,
    `Soils report required above ${c.slopeSoilsPct}% slope`, `Required sheets: ${["Site plan", "Floor plan", "Elevations", "Title 24 energy report", "Structural calcs", ...c.extraDocs].join(", ")}`].join("\n");
}

function check() {
  const cityName = document.getElementById("city").value;
  const c = CITIES[cityName];
  const p = {
    ...MODELS[document.getElementById("model").value],
    height: +document.getElementById("height").value, side: +document.getElementById("side").value, rear: +document.getElementById("rear").value,
    transit: +document.getElementById("transit").value, slope: +document.getElementById("slope").value, primarySpr: document.getElementById("spr").value === "yes",
    docs: [...document.querySelectorAll("#docs input:checked")].map((i) => i.value),
  };
  const rows = [];
  const add = (rule, local, floor, value, ok, preempted, fix, cite) => rows.push({ rule, local, floor, value, ok, preempted, fix, cite });

  const hFloor = STATE.maxHeightMin(p.transit);
  const hLimit = Math.max(c.height, hFloor);
  add("Height", `${c.height} ft`, `≥ ${hFloor} ft allowed`, `${p.height} ft`, p.height <= hLimit, c.height < hFloor && p.height <= hLimit,
    p.height > hLimit ? `Reduce height to ${hLimit} ft (roof pitch or foundation)` : null, "State: height up to 16 ft (18 ft near transit)");
  for (const side of ["side", "rear"]) {
    const limit = Math.min(c[side], STATE.setbackMax);
    add(`${side[0].toUpperCase() + side.slice(1)} setback`, `${c[side]} ft`, `≤ ${STATE.setbackMax} ft may be required`, `${p[side]} ft`,
      p[side] >= limit, c[side] > STATE.setbackMax && p[side] >= limit, p[side] < limit ? `Move ADU to ${limit} ft from ${side} line` : null, "State: max 4 ft side/rear setback");
  }
  const sizeFloor = STATE.sizeAllowedMin(p.beds);
  add("Unit size", `≤ ${c.maxSize} sq ft`, `must allow ${sizeFloor}`, `${p.size} sq ft`, true, c.maxSize < sizeFloor && p.size > c.maxSize, null, "State: must allow 850 / 1,000 sq ft");
  const parkingNeeded = p.transit <= STATE.parkingExemptMi ? 0 : c.parking;
  add("Parking", `${c.parking} space`, `0 within ${STATE.parkingExemptMi} mi of transit`, `${p.transit} mi to transit`, true, c.parking > 0 && parkingNeeded === 0,
    null, "State: no parking near public transit");
  const sprNeeded = c.sprinklers && p.primarySpr;
  add("Fire sprinklers", c.sprinklers ? "required" : "if primary has them", "only if primary has them", p.primarySpr ? "primary sprinklered" : "primary not sprinklered",
    true, c.sprinklers && !sprNeeded, null, "State: sprinklers only if required for primary");
  const required = ["Site plan", "Floor plan", "Elevations", "Title 24 energy report", "Structural calcs", ...c.extraDocs, ...(p.slope > c.slopeSoilsPct ? ["Soils report"] : [])];
  required.forEach((d) => add(`Sheet: ${d}`, "required", "—", p.docs.includes(d) ? "included" : "missing", p.docs.includes(d), false,
    p.docs.includes(d) ? null : d === "Soils report" ? `Add soils report (lot slope ${p.slope}% > ${c.slopeSoilsPct}%)` : `Add ${d}`, "Local submittal checklist"));

  const fixes = rows.filter((r) => !r.ok);
  const pre = rows.filter((r) => r.preempted);
  ["kpis", "checkbox", "outs"].forEach((id) => document.getElementById(id).classList.remove("hidden"));
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="v">${rows.length}</div><div class="l">checks run</div></div>
    <div class="kpi"><div class="v" style="color:var(--bad)">${fixes.length}</div><div class="l">would trigger a correction cycle</div></div>
    <div class="kpi"><div class="v" style="color:var(--accent)">${pre.length}</div><div class="l">local rules overridden by state law</div></div>
    <div class="kpi"><div class="v">~${fixes.length ? fixes.length * 4 : 0} wks</div><div class="l">of plan-check back-and-forth avoided (est.)</div></div>`;
  document.getElementById("check").innerHTML = `<tr><th>Check</th><th>City rule</th><th>State floor</th><th>This project</th><th>Result</th></tr>` +
    rows.map((r) => `<tr><td>${r.rule}</td><td>${r.local}</td><td class="note">${r.floor}</td><td>${r.value}</td>
      <td>${!r.ok ? '<span class="badge bad">Fix</span>' : r.preempted ? '<span class="badge info">Passes; local rule preempted</span>' : '<span class="badge good">Pass</span>'}</td></tr>`).join("");
  document.getElementById("fix").textContent = fixes.length ? fixes.map((f, i) => `${i + 1}. ${f.fix}`).join("\n") : "Nothing to fix. Submit.";
  document.getElementById("letter").textContent = pre.length ? [
    `To: ${cityName.split(" (")[0]} Planning Division`, `Re: Detached ADU permit application (${p.beds ? p.beds + "BR" : "studio"}, ${p.size} sq ft)`, "",
    "This application complies with state ADU law. The following local standards cannot be applied to it:",
    ...pre.map((r) => `  • ${r.rule}: local ${r.local}; state law: ${r.cite.replace("State: ", "")}.`),
    "", `Please complete review within the ${STATE.reviewDays}-day statutory period.`,
  ].join("\n") : "No local rules conflict with state law here.";
}

const sel = document.getElementById("city");
Object.keys(CITIES).forEach((c) => sel.add(new Option(c, c)));
sel.value = "Hillside City";
const showRules = () => { document.getElementById("rules").textContent = rulesText(CITIES[sel.value]); };
sel.addEventListener("change", showRules);
showRules();
document.getElementById("docs").innerHTML = BASE_DOCS.map((d) => `<label style="display:flex;gap:5px;align-items:center;color:var(--ink)">
  <input type="checkbox" value="${d}" ${["Site plan", "Floor plan", "Elevations", "Title 24 energy report", "Structural calcs", "Fire access plan"].includes(d) ? "checked" : ""}>${d}</label>`).join("");
document.getElementById("run").addEventListener("click", check);

Demo.run({
  intro: { kicker: "Bottleneck 8 of 10 · Abodu", title: "Permits are city by city",
    body: ["Abodu got permits in about an hour where it was pre-approved, as in San Jose. Elsewhere, ADU plan review can take 3–6 months of correction cycles.",
      "In Rancho Palos Verdes the city unlawfully denied an Abodu permit, and the homeowners were referred to legal counsel."],
    source: "Sources: probuilder.com (San Jose) · calhdf.org (Rancho Palos Verdes) · studio-home.com / Bay Modular (timelines)" },
  outro: { kicker: "Result", title: "Correct the first time, and push back where the law allows",
    bullets: ["Real plan problems caught before submission (missing tree survey and soils report)", "Local rules that exceed state limits identified automatically",
      "Cover letter cites the state floor for each one", "Rule sets are reusable for every new city Abodu enters"] },
}, [
  () => Demo.caption("A new city with no pre-approval. The local rules include some stricter than state law allows."),
  () => Demo.highlight("#rules", 2800),
  () => Demo.caption("The project goes in: the 2-bedroom model, 17 ft tall, 4 ft side setback, on an 18% slope near transit."),
  () => Demo.highlight(".form-grid", 2600),
  () => Demo.click("#run"),
  () => Demo.caption("Each rule is checked against both the city's number and the state floor."),
  () => Demo.highlight("#checkbox", 4000),
  () => Demo.caption("Genuine issues to fix now: two missing sheets, including a soils report because the slope is over 15%."),
  () => Demo.highlight("#outs .panel:first-child", 3000),
  () => Demo.caption("The city's 10 ft setbacks, 14 ft height cap, 750 sq ft size cap, parking and sprinkler rules are overridden by state law, and the letter says so."),
  () => Demo.highlight("#outs .panel:last-child", 4000),
]);
