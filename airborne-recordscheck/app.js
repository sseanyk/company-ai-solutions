// RecordsCheck: parse free-text maintenance records, compute AD status (one-time and
// repetitive), check LLP cycle chains for gaps, and flag unsigned entries.

const ADS = [
  { id: "AD 2019-0X-11", subject: "Fuel pump wiring inspection", type: "repeat", everyFH: 6000 },
  { id: "AD 2020-0X-03", subject: "MLG side-stay pin replacement", type: "once" },
  { id: "AD 2021-0X-27", subject: "Elevator servo-control rod-end inspection", type: "repeat", everyFC: 3000 },
  { id: "AD 2022-0X-15", subject: "Cargo door latch modification", type: "once" },
  { id: "AD 2023-0X-08", subject: "Engine fan blade dovetail inspection", type: "repeat", everyFC: 1500 },
  { id: "AD 2024-0X-19", subject: "Slat track corrosion inspection", type: "repeat", everyFH: 4000 },
  { id: "AD 2025-0X-02", subject: "ELT battery replacement", type: "once" },
];

const LLPS = [
  { pn: "FAN DISK P/N 3xx-001", sn: "DK4471", limit: 30000 },
  { pn: "HPT STG1 DISK P/N 3xx-114", sn: "HT2290", limit: 20000 },
  { pn: "LPT SHAFT P/N 3xx-207", sn: "LS0915", limit: 25000 },
];

const RECORDS = `2016-03-02 | FH 8200 FC 4100 | engine ESN 699-411 installed new on aircraft. Signed K. Obi lic 2231
2016-03-02 | NEW: FAN DISK S/N DK4471 installed new, CSN 0. Signed K. Obi lic 2231
2016-03-02 | NEW: HPT STG1 DISK S/N HT2290 installed new, CSN 0. Signed K. Obi lic 2231
2016-03-02 | NEW: LPT SHAFT S/N LS0915 installed new, CSN 0. Signed K. Obi lic 2231
2019-06-14 | FH 22410 FC 12020 | AD 2019-0X-11 fuel pump wiring inspected, no findings. Signed M. Grant lic 8812
2020-09-30 | FH 26105 FC 14100 | AD 2020-0X-03 side-stay pins replaced IAW SB 32-1188. Signed M. Grant lic 8812
2021-02-11 | shop visit ESN 699-411: FAN DISK S/N DK4471 CSN 10200 returned to service. Signed A. Lund lic 5510
2021-02-11 | shop visit ESN 699-411: HPT STG1 DISK S/N HT2290 CSN 10200 returned to service. Signed A. Lund lic 5510
2022-05-19 | FH 31980 FC 17060 | AD 2021-0X-27 rod-end inspection accomplished. Signed P. Hale lic 1093
2022-11-03 | FH 33400 FC 17890 | AD 2022-0X-15 cargo door latch modified. Signed P. Hale lic 1093
2023-08-21 | FH 36015 FC 19300 | AD 2019-0X-11 fuel pump wiring inspected, no findings.
2024-01-09 | shop visit ESN 699-411: LPT SHAFT S/N LS0915 CSN 18100 returned to service. Signed A. Lund lic 5510
2024-04-17 | FH 38200 FC 20510 | AD 2023-0X-08 fan blade dovetail inspected. Signed R. Diaz lic 4471
2024-06-02 | FH 38650 FC 20790 | AD 2024-0X-19 slat tracks inspected, minor corrosion blended. Signed R. Diaz lic 4471
2025-10-12 | FH 40800 FC 21880 | AD 2021-0X-27 rod-end inspection accomplished. Signed R. Diaz lic 4471
2026-07-30 | FAN DISK S/N DK4471 CSN 17900 per engine records. Signed R. Diaz lic 4471
2026-07-30 | HPT STG1 DISK S/N HT2290 CSN 17900 per engine records. Signed R. Diaz lic 4471
2026-07-30 | LPT SHAFT S/N LS0915 CSN 19850 per engine records. Signed R. Diaz lic 4471`;

function parse(text) {
  return text.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
    const date = (line.match(/\b(\d{4}-\d{2}-\d{2})\b/) || [])[1];
    const fh = +((line.match(/\bFH\s*(\d+)/) || [])[1] || NaN);
    const fc = +((line.match(/\bFC\s*(\d+)/) || [])[1] || NaN);
    const ad = (line.match(/\bAD\s*(\d{4}-0X-\d{2})/) || [])[1];
    const sn = (line.match(/S\/N\s*([A-Z]{2}\d{4})/) || [])[1];
    const csn = +((line.match(/\bCSN\s*(\d+)/) || [])[1] ?? NaN);
    const signed = /signed\s+[A-Z]\.\s*\w+.*lic\s*\d+/i.test(line);
    return { line, date, fh, fc, ad: ad ? `AD ${ad}` : null, sn, csn, signed };
  });
}

function audit() {
  const fh = +document.getElementById("fh").value;
  const fc = +document.getElementById("fc").value;
  const ents = parse(document.getElementById("recs").value);

  const adRows = ADS.map((a) => {
    const hits = ents.filter((e) => e.ad === a.id).sort((x, y) => (x.date < y.date ? -1 : 1));
    const lastE = hits[hits.length - 1];
    if (!lastE) return { ...a, status: "No record", cls: "bad", detail: "No compliance entry found", unsigned: false };
    if (a.type === "once") return { ...a, status: "Complied", cls: "good", detail: `${lastE.date}`, unsigned: !lastE.signed, last: lastE };
    const nextFH = a.everyFH ? lastE.fh + a.everyFH : Infinity;
    const nextFC = a.everyFC ? lastE.fc + a.everyFC : Infinity;
    const remFH = nextFH - fh, remFC = nextFC - fc;
    const overdue = remFH < 0 || remFC < 0;
    const soon = !overdue && (remFH < 500 || remFC < 300);
    const detail = a.everyFH ? `last ${lastE.date} @ FH ${lastE.fh}; next FH ${nextFH} (${remFH >= 0 ? remFH + " left" : -remFH + " over"})`
      : `last ${lastE.date} @ FC ${lastE.fc}; next FC ${nextFC} (${remFC >= 0 ? remFC + " left" : -remFC + " over"})`;
    return { ...a, status: overdue ? "Overdue" : soon ? "Due soon" : "Complied", cls: overdue ? "bad" : soon ? "warn" : "good", detail, unsigned: !lastE.signed, last: lastE };
  });

  const llpRows = LLPS.map((p) => {
    const chain = ents.filter((e) => e.sn === p.sn && Number.isFinite(e.csn)).sort((x, y) => (x.date < y.date ? -1 : 1));
    // engine cycles grow alongside aircraft cycles here; flag a jump larger than the aircraft flew in that interval
    const acCycles = (d) => {
      const pts = ents.filter((e) => Number.isFinite(e.fc)).map((e) => [e.date, e.fc]).sort();
      const before = pts.filter(([dt]) => dt <= d).pop();
      return before ? before[1] : null;
    };
    const gaps = [];
    for (let i = 1; i < chain.length; i++) {
      const dCsn = chain[i].csn - chain[i - 1].csn;
      const a0 = acCycles(chain[i - 1].date), a1 = acCycles(chain[i].date);
      if (a0 != null && a1 != null && dCsn > a1 - a0 + 1500) gaps.push(`${chain[i - 1].date} → ${chain[i].date}: +${dCsn} cycles vs ~${a1 - a0} flown; missing intermediate records`);
    }
    const last = chain[chain.length - 1];
    const startsNew = chain[0] && chain[0].csn === 0;
    return { ...p, chain, gaps, startsNew, csn: last?.csn, remaining: last ? p.limit - last.csn : null };
  });

  const unsigned = ents.filter((e) => (e.ad || e.sn) && !e.signed);
  const issues = adRows.filter((a) => a.cls !== "good").length + llpRows.filter((l) => l.gaps.length || !l.startsNew).length + unsigned.length;
  const ready = Math.max(0, 100 - issues * 11);

  ["kpis", "res", "punchbox"].forEach((id) => document.getElementById(id).classList.remove("hidden"));
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="v">${ents.length}</div><div class="l">record entries parsed</div></div>
    <div class="kpi"><div class="v">${adRows.filter((a) => a.cls === "good").length}/${ADS.length}</div><div class="l">ADs cleanly complied</div></div>
    <div class="kpi"><div class="v">${llpRows.filter((l) => !l.gaps.length && l.startsNew).length}/${LLPS.length}</div><div class="l">LLPs with full back-to-birth</div></div>
    <div class="kpi"><div class="v" style="color:${ready > 80 ? "var(--good)" : "var(--warn)"}">${ready}%</div><div class="l">redelivery readiness</div></div>`;
  document.getElementById("ads").innerHTML = `<tr><th>AD</th><th>Subject</th><th>Status</th><th>Evidence</th></tr>` +
    adRows.map((a) => `<tr><td class="mono">${a.id}</td><td>${a.subject}</td><td><span class="badge ${a.cls}">${a.status}</span>${a.unsigned ? ' <span class="badge warn">unsigned</span>' : ""}</td><td class="note">${a.detail}</td></tr>`).join("");
  document.getElementById("llp").innerHTML = `<tr><th>Part</th><th class="num">CSN</th><th class="num">Remaining</th><th>Trace</th></tr>` +
    llpRows.map((l) => `<tr><td class="mono">${l.pn}<br>S/N ${l.sn}</td><td class="num">${Util.fmt(l.csn)}</td><td class="num">${Util.fmt(l.remaining)}</td>
      <td>${l.gaps.length ? `<span class="badge bad">Gap</span><div class="note">${l.gaps.join("<br>")}</div>` : '<span class="badge good">Unbroken from new</span>'}</td></tr>`).join("");
  const punch = [
    ...adRows.filter((a) => a.status === "No record").map((a) => `□ ${a.id} (${a.subject}): locate the compliance record or accomplish before return.`),
    ...adRows.filter((a) => a.status === "Overdue").map((a) => `□ ${a.id}: OVERDUE (${a.detail}). Ground-risk item; schedule immediately.`),
    ...adRows.filter((a) => a.status === "Due soon").map((a) => `□ ${a.id}: due within the return window. Accomplish before return per lease redelivery conditions.`),
    ...unsigned.map((e) => `□ Unsigned entry ${e.date}: "${e.line.split("|").pop().trim()}". Obtain certifying signature or a re-inspection.`),
    ...llpRows.filter((l) => l.gaps.length).map((l) => `□ ${l.pn} S/N ${l.sn}: back-to-birth gap. Request engine shop records (${l.gaps[0].split(":")[0]}).`),
  ];
  document.getElementById("punch").textContent = `REDELIVERY PUNCH LIST · ${document.getElementById("msn").value} · ${punch.length} items\n\n` + punch.join("\n");
}

document.getElementById("adlist").textContent = ADS.map((a) => `${a.id}  ${a.subject}  [${a.type === "once" ? "one-time" : a.everyFH ? `repeat ${a.everyFH} FH` : `repeat ${a.everyFC} FC`}]`).join("\n");
document.getElementById("recs").value = RECORDS;
document.getElementById("run").addEventListener("click", audit);

Demo.run({
  intro: { kicker: "Bottleneck 6 of 10 · Airborne Capital", title: "Lease returns stall on paper records",
    body: ["Many lessors still work from paper and PDF maintenance records, which makes it slow to show that every airworthiness directive (AD) and every life-limited part is fully documented.",
      "Aviation Week calls technical documentation one of the most onerous parts of a lease transition. Airborne Capital has partnered with an AI records-review platform for end-of-lease work."],
    source: "Sources: aviationweek.com (MRO Memo: AI and lease transitions) · provenair / aviationpros.com" },
  outro: { kicker: "Result", title: "A records audit that used to take weeks, in seconds",
    bullets: ["Every AD status computed, including repeat intervals in hours or cycles", "Life-limited part histories checked cycle by cycle for gaps",
      "Unsigned entries caught", "Punch list ready for the redelivery meeting"] },
}, [
  () => Demo.caption("Scanned logbook pages (OCR text) for an A320, plus the AD list that applies to it."),
  () => Demo.highlight("#recs", 2800),
  () => Demo.click("#run"),
  () => Demo.caption("Each AD is matched to its record. One has no record at all; the fan-blade inspection is overdue by cycles."),
  () => Demo.highlight("#ads", 4000),
  () => Demo.caption("Life-limited part histories: the LPT shaft's cycle jump doesn't match the cycles flown, so records are missing."),
  () => Demo.highlight("#llp", 3600),
  () => Demo.caption("Everything rolls into a redelivery punch list, including an unsigned AD entry."),
  () => Demo.highlight("#punchbox", 3600),
]);
