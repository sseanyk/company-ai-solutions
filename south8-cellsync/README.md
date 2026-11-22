<div align="center">

# CellSync

**Merge battery cycler exports from any brand into one clean dataset, then chart, flag and report.**

Built for the bottleneck at **South 8 Technologies** · Tool 1 of 10

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white) ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black) ![No build step](https://img.shields.io/badge/build-none-brightgreen) ![Offline](https://img.shields.io/badge/network-offline-blue) ![Data](https://img.shields.io/badge/data-synthetic-lightgrey)

[**▶ Watch the demo**](south8-cellsync-demo.mp4) · [Quick start](#quick-start) · [How to use it](#how-to-use-it) · [How it works](#how-it-works)

</div>

---

## Table of contents

- [The bottleneck](#the-bottleneck)
- [Features](#features)
- [Quick start](#quick-start)
- [How to use it](#how-to-use-it)
- [Input format](#input-format)
- [How it works](#how-it-works)
- [Demo video](#demo-video)
- [Project structure](#project-structure)
- [Limitations](#limitations)

## The bottleneck

Battery labs run cells on cyclers from several vendors (Arbin, Maccor, Neware…). Each one exports different column names, units and delimiters, so engineers spend hours cleaning spreadsheets before they can compare cells or write up a test.

## Features

- Detects the cycle, charge, discharge and temperature columns from header text, with no template per vendor
- Reads units from the header (`Ah` vs `mAh`) and normalizes everything to mAh
- Handles comma, tab and semicolon delimited files
- Plots capacity retention for every cell on one axis, with the 80% end-of-life line
- Projects cycles to 80% for the worst cell
- Flags anomalies (sudden drops, outliers) with a robust MAD z-score
- Writes a test report and exports the harmonized CSV

## Quick start

No install, no build step and no network. You only need a modern browser (Chrome, Edge, Safari or Firefox).

```bash
open index.html
```

> [!TIP]
> Add `?demo=1` to the URL to watch the scripted walkthrough instead of using the tool yourself:
> `index.html?demo=1`

> [!IMPORTANT]
> The page loads its styles and helpers from `../shared/`. If you copy this folder on its own, copy `shared/` next to it
> (keep the same layout), or the page will load without styling.

## How to use it

1. Three sample exports (Arbin CSV, Maccor TSV, Neware semicolon file) are already loaded in **1 · Raw exports**. Edit them, or click **Add a file** to load your own `.csv`, `.tsv` or `.txt`.
2. Click **Harmonize & analyze**.
3. Check **2 · Column mapping**: it shows which column it picked for each field and the unit it detected.
4. Read **3 · Capacity retention** and **4 · Anomalies**.
5. Copy the report from **5 · Auto-generated test report**, or click **Download harmonized CSV**.

## Input format

Any delimited text file with a header row. Header names it recognizes include:

| Field | Examples |
|-------|----------|
| Cycle | `Cycle_Index`, `Cyc#`, `Cycle ID`, `cycle` |
| Discharge capacity | `Discharge_Capacity(Ah)`, `DCap(mAh)`, `Discharge Cap.(mAh)` |
| Charge capacity | `Charge_Capacity(Ah)`, `CCap(mAh)`, `Charge Cap.(mAh)` |
| Temperature (optional) | `Aux_Temperature(C)`, `Temp(C)` |

If a header has no unit, mAh is assumed and the mapping table says so.

## How it works

```mermaid
flowchart LR
    N0["Raw exports"]
    N1["Header + unit detection"]
    N2["Merged mAh table"]
    N3["Retention + EOL projection"]
    N4["Anomaly check"]
    N5["Report + CSV"]
    N0 --> N1 --> N2 --> N3 --> N4 --> N5
```

Each header is matched against a small set of regular expressions per field, and the unit is read from the same header. Retention is discharge capacity divided by the cell's early-cycle baseline. Anomalies use the median absolute deviation of cycle-to-cycle changes, and findings of the same kind within 6 cycles are collapsed into one.

## Demo video

[`south8-cellsync-demo.mp4`](south8-cellsync-demo.mp4) is a 1280×720 recording of the `?demo=1` walkthrough (about 50 seconds).

To record it again, from the parent folder:

```bash
python3 record.py south8-cellsync
```

## Project structure

```text
south8-cellsync/
├── index.html              # page layout
├── app.js                  # tool logic and the demo script
├── south8-cellsync-demo.mp4 # recorded walkthrough
└── README.md
../shared/
├── style.css               # shared look and demo overlays
└── demo.js                 # demo driver and helpers (charts, RNG, download)
```

## Limitations

> [!NOTE]
> All data in this tool is synthetic. South 8 Technologies is named only to identify whose publicly reported bottleneck this targets;
> the company is not affiliated with this project and has not reviewed it.

- The tool uses deterministic rules so it runs offline and gives the same result every time.
- **What a production version would add:** A vision/LLM step to read cycler PDFs and unusual exports, and direct pulls from the lab's cycler database.
- Regulatory and engineering content is simplified for illustration and is not professional advice.

<div align="right"><a href="#cellsync">↑ Back to top</a></div>
