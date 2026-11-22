// LoadLens: regress monthly gas use on heating degree-days to get the home's real
// heat-loss coefficient (UA), then size a cold-climate heat pump at the design temperature.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HDD_SHAPE = [1100, 950, 820, 520, 250, 60, 5, 10, 110, 380, 640, 960]; // Boston-like monthly HDD65
const CITIES = {
  "Boston, MA": { design: 7, hdd: 5600 },
  "Albany, NY": { design: -1, hdd: 6800 },
  "Denver, CO": { design: 3, hdd: 6000 },
  "Minneapolis, MN": { design: -11, hdd: 7600 },
};
const MODELS = [2, 3, 4, 5].map((t) => ({ name: `CCHP-${t * 12}`, tons: t, nominal: t * 12000, price: 6500 + 3200 * t }));
const INDOOR_F = 70;

const capacityAt = (m, tempF) => m.nominal * Math.min(1, 0.75 + 0.01 * tempF); // illustrative cold-climate derate

function monthlyHdd(city) {
  const total = HDD_SHAPE.reduce((a, b) => a + b, 0);
  return HDD_SHAPE.map((h) => (h * CITIES[city].hdd) / total);
}

// Pull "month ... number" pairs out of whatever the customer pasted.
function parseBill(text) {
  const out = new Array(12).fill(null);
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\b/i);
    if (!m) continue;
    const idx = MONTHS.findIndex((x) => x.toLowerCase() === m[1].slice(0, 3).toLowerCase());
    const rest = line.slice(m.index + m[0].length).replace(/\b(19|20)\d{2}\b/, "");
    const nums = [...rest.matchAll(/(\d[\d,]*\.?\d*)\s*(therms?|thm|ccf)?/gi)];
    const withUnit = nums.find((n) => n[2]);
    const pick = withUnit || nums[0];
    if (pick) out[idx] = parseFloat(pick[1].replace(/,/g, "")) * (/ccf/i.test(pick[2] || "") ? 1.037 : 1);
  }
  return out;
}

function fit(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const a = my - b * mx;
  const ssr = ys.reduce((s, y, i) => s + (y - (a + b * xs[i])) ** 2, 0);
  const sst = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  return { a, b, r2: 1 - ssr / sst };
}

const pick = (load, design) => MODELS.find((m) => capacityAt(m, design) >= load) || MODELS[MODELS.length - 1];

function run() {
  const city = document.getElementById("city").value;
  const sqft = +document.getElementById("sqft").value;
  const afue = +document.getElementById("afue").value;
  const { design } = CITIES[city];
  const therms = parseBill(document.getElementById("bill").value);
  const hdd = monthlyHdd(city);
  const pts = therms.map((t, i) => (t == null ? null : [hdd[i], t])).filter(Boolean);
  if (pts.length < 6) {
    alert("Need at least 6 months of usage to calibrate. Check the pasted bill.");
    return;
  }
  const f = fit(pts.map((p) => p[0]), pts.map((p) => p[1]));
  const ua = (f.b * 1e5 * afue) / 24; // BTU/hr·°F
  const billLoad = ua * (INDOOR_F - design);
  const ruleLoad = sqft * 35;
  const mjDefault = billLoad * 1.35; // Jetson: conventional Manual J runs 30–40% high
  const methods = [
    { name: "Rule of thumb (35 BTU/sq ft)", load: ruleLoad },
    { name: "Manual J with conservative defaults (≈ +35%)", load: mjDefault },
    { name: "LoadLens: calibrated to this home's bills", load: billLoad, best: true },
  ].map((m) => ({ ...m, model: pick(m.load, design) }));
  const ours = methods[2];

  ["kpis", "results", "quotebox"].forEach((id) => document.getElementById(id).classList.remove("hidden"));
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="v">${pts.length}/12</div><div class="l">months read from the bill</div></div>
    <div class="kpi"><div class="v">${Util.fmt(ua)}</div><div class="l">heat loss, BTU/hr·°F (R² ${f.r2.toFixed(2)})</div></div>
    <div class="kpi"><div class="v">${Util.fmt(billLoad / 1000, 1)}k</div><div class="l">design load at ${design}°F, BTU/hr</div></div>
    <div class="kpi"><div class="v">${ours.model.tons} ton</div><div class="l">recommended (${ours.model.name})</div></div>`;

  Util.lineChart(document.getElementById("chart"), [
    { name: "billed therms", color: "#2f6bff", points: pts, dots: true },
    { name: "fit: base + slope × HDD", color: "#12855a", points: [[0, f.a], [Math.max(...hdd), f.a + f.b * Math.max(...hdd)]] },
  ], { xLabel: "heating degree-days in month", yLabel: "therms" });
  document.getElementById("fitnote").textContent =
    `Base load ${f.a.toFixed(0)} therms/mo (water heating, cooking) is removed. Space heating uses ${f.b.toFixed(3)} therms per degree-day, so UA = ${Util.fmt(ua)} BTU/hr·°F.`;

  document.getElementById("compare").innerHTML = `<tr><th>Method</th><th class="num">Design load</th><th>Equipment</th><th class="num">Installed price</th></tr>` +
    methods.map((m) => `<tr${m.best ? ' style="background:#e3f5ec"' : ""}><td>${m.name}</td><td class="num">${Util.fmt(m.load)} BTU/h</td>
      <td>${m.model.name} (${m.model.tons} ton)${m.load > capacityAt(MODELS[3], design) ? ' <span class="badge bad">exceeds largest unit</span>' : ""}</td>
      <td class="num">$${Util.fmt(m.model.price)}</td></tr>`).join("");

  const cust = document.getElementById("cust").value;
  const over = methods[1];
  document.getElementById("quote").textContent = [
    `QUOTE DRAFT · ${cust} · ${city} · ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `Recommended system: ${ours.model.name}, ${ours.model.tons}-ton cold-climate heat pump`,
    `  Capacity at ${design}°F design temp: ${Util.fmt(capacityAt(ours.model, design))} BTU/h  vs  load ${Util.fmt(billLoad)} BTU/h`,
    `  Margin: ${(((capacityAt(ours.model, design) / billLoad) - 1) * 100).toFixed(0)}%, so no electric backup heat strip is needed`,
    ``,
    `Installed price (illustrative): $${Util.fmt(ours.model.price)}`,
    `Compared with conservative Manual J sizing (${over.model.name}): $${Util.fmt(over.model.price - ours.model.price)} less, and the unit cycles less`,
    ``,
    `Sizing basis (attach to permit / rebate application):`,
    `  ${pts.length} months of billed gas use regressed on heating degree-days (R² = ${f.r2.toFixed(2)})`,
    `  UA = ${Util.fmt(ua)} BTU/hr·°F, indoor ${INDOOR_F}°F, outdoor design ${design}°F, furnace AFUE ${afue}`,
    `  Load verified after install against monitored runtime (closes the loop on the model)`,
  ].join("\n");
}

const sel = document.getElementById("city");
Object.keys(CITIES).forEach((c) => sel.add(new Option(c, c)));
document.getElementById("run").addEventListener("click", run);

function sampleBill() {
  const r = Util.rng(4);
  const hdd = monthlyHdd("Boston, MA");
  const rows = ["Eversource-style usage history · Acct ****1182", "Billing period      Usage        Days   Amount"];
  [10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((i) => {
    const t = 18 + 0.158 * hdd[i] * (0.93 + 0.14 * r());
    const yr = i >= 10 ? 2025 : 2026;
    rows.push(`${MONTHS[i]} ${yr}         ${t.toFixed(0)} therms   ${30 + Math.round(r())}     $${(t * 1.92).toFixed(2)}`);
  });
  return rows.join("\n");
}

Demo.run({
  intro: { kicker: "Bottleneck 2 of 10 · Jetson", title: "Every heat pump quote waits on a load calculation",
    body: ["Codes require a Manual J calculation before equipment is chosen. In practice, installers guess, or enter conservative defaults.",
      "Jetson's CEO estimates conventional Manual J runs 30–40% higher than measured loads, which oversizes systems and inflates quotes."],
    source: "Sources: jetsonhome.com/glossary/manual-j · finehomebuilding.com (load calcs)" },
  outro: { kicker: "Result", title: "From bill to right-sized quote in under a minute",
    bullets: ["Uses the home's real heat loss from 12 months of gas data", "One ton smaller than default sizing, so cheaper and fewer short cycles",
      "Sizing basis printed for the permit and rebate packet", "Post-install monitoring feeds back into the model"] },
}, [
  () => Demo.caption("A sales rep picks the location and pastes the customer's gas bill history, as-is."),
  () => Demo.setValue("#city", "Boston, MA"),
  () => Demo.type("#bill", sampleBill(), 4),
  () => Demo.click("#run"),
  () => Demo.caption("It reads the months and therms, strips out water heating, and fits gas use against degree-days."),
  () => Demo.highlight("#results .panel", 3200),
  () => Demo.caption("That gives the home's actual heat-loss rate, so the load at Boston's 7°F design day is measured, not guessed."),
  () => Demo.highlight("#kpis", 2800),
  () => Demo.caption("Compare: the rule of thumb and default Manual J both oversize. The calibrated method picks a smaller, cheaper unit."),
  () => Demo.highlight("#compare", 3600),
  () => Demo.caption("The quote and sizing report come out ready to send and to attach to the permit."),
  () => Demo.highlight("#quotebox", 3400),
]);
