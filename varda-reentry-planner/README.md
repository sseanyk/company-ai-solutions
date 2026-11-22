<div align="center">

# ReentryOps

**Screen every reentry opportunity against every stakeholder's limits and issue one plan they all sign.**

Built for the bottleneck at **Varda Space Industries** · Tool 5 of 10

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white) ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black) ![No build step](https://img.shields.io/badge/build-none-brightgreen) ![Offline](https://img.shields.io/badge/network-offline-blue) ![Data](https://img.shields.io/badge/data-synthetic-lightgrey)

[**▶ Watch the demo**](varda-reentry-planner-demo.mp4) · [Quick start](#quick-start) · [How to use it](#how-to-use-it) · [How it works](#how-it-works)

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

Varda's first capsule waited about eight months in orbit while the FAA license, the Air Force range, weather and the recovery team all had to line up on the same window.

## Features

- Screens every deorbit opportunity in the next 14 days (213 in the sample) against all constraints at once
- Constraints: cross-range to the landing site, surface wind, Part 450 public risk (Ec), NOTAM lead time, daylight landing and range blocks
- Shows a timeline of which constraint rejects each opportunity
- Ranks the passing windows and names a primary and a backup
- Writes one coordination packet for every party
- Re-plans instantly when a window is withdrawn

## Quick start

No install, no build step and no network. You only need a modern browser (Chrome, Edge, Safari or Firefox).

```bash
open index.html
```

Or download this tool on its own, with the shared files included: [**varda-reentry-planner-code.zip**](https://github.com/sseanyk/company-ai-solutions/releases/download/v1.0/varda-reentry-planner-code.zip). Unzip it and open `varda-reentry-planner/index.html`.

> [!TIP]
> Add `?demo=1` to the URL to watch the scripted walkthrough instead of using the tool yourself:
> `index.html?demo=1`

> [!IMPORTANT]
> The page loads its styles and helpers from `../shared/`. If you copy this folder on its own, copy `shared/` next to it
> (keep the same layout), or the page will load without styling.

## How to use it

1. Set the limits in **1 · Constraints from each stakeholder**.
2. Click **Find reentry windows**.
3. Read the timeline in **2 · Timeline**: green ticks pass everything, grey ones fail at least one constraint.
4. Pick from **3 · Ranked windows** and share **4 · Coordination packet**.
5. Click **Simulate: range withdraws top window** to see the backup promoted and the packet rewritten.

## Input format

Only the five constraint fields on the page. The orbit, weather and range data are generated.

## How it works

```mermaid
flowchart LR
    N0["Deorbit opportunities"]
    N1["Cross-range / wind / Ec / NOTAM / daylight / range checks"]
    N2["Passing windows"]
    N3["Ranking"]
    N4["Primary + backup"]
    N5["Packet"]
    N0 --> N1 --> N2 --> N3 --> N4 --> N5
```

Each opportunity is tested against every constraint and the first failure is recorded as the blocker. Passing windows are ranked by margin to the limits.

## Demo video

[`varda-reentry-planner-demo.mp4`](varda-reentry-planner-demo.mp4) is a 1280×720 recording of the `?demo=1` walkthrough (about 50 seconds).

To record it again, from the parent folder:

```bash
python3 record.py varda-reentry-planner
```

## Project structure

```text
varda-reentry-planner/
├── index.html              # page layout
├── app.js                  # tool logic and the demo script
├── varda-reentry-planner-demo.mp4 # recorded walkthrough
└── README.md
../shared/
├── style.css               # shared look and demo overlays
└── demo.js                 # demo driver and helpers (charts, RNG, download)
```

## Limitations

> [!NOTE]
> All data in this tool is synthetic. Varda Space Industries is named only to identify whose publicly reported bottleneck this targets;
> the company is not affiliated with this project and has not reviewed it.

- The tool uses deterministic rules so it runs offline and gives the same result every time.
- **What a production version would add:** Live ephemeris (TLE), National Weather Service forecasts, the range scheduling system and a full Part 450 risk model.
- Regulatory and engineering content is simplified for illustration and is not professional advice.

<div align="right"><a href="#reentryops">↑ Back to top</a></div>
