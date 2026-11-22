<div align="center">

# Company AI Solutions

**Ten US hardware and deep-tech companies, ten workflow bottlenecks, ten working fixes.**

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white) ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black) ![No build step](https://img.shields.io/badge/build-none-brightgreen) ![Offline](https://img.shields.io/badge/network-offline-blue) ![Tools](https://img.shields.io/badge/tools-10-purple)

[The tools](#the-tools) · [Quick start](#quick-start) · [Recording](#recording-the-videos)

</div>

---

Each folder is a self-contained browser tool (plain HTML and JavaScript, no build step, no network) aimed at a publicly
reported bottleneck at one company. Every folder has its own README with step-by-step instructions and its own demo clip,
so each one can be shared on its own.

## The tools

| # | Company | Bottleneck | Tool | Demo |
|:-:|---------|------------|------|:----:|
| 1 | South 8 Technologies | Test data from mixed cycler brands is slow to clean and combine | [**CellSync**](south8-cellsync/) | [▶](south8-cellsync/south8-cellsync-demo.mp4) |
| 2 | Jetson | Every quote needs a load calculation that runs 30–40% high | [**LoadLens**](jetson-loadlens/) | [▶](jetson-loadlens/jetson-loadlens-demo.mp4) |
| 3 | Hadrian | First-article inspection reports take 40+ hours per part | [**AutoBalloon**](hadrian-autoballoon/) | [▶](hadrian-autoballoon/hadrian-autoballoon-demo.mp4) |
| 4 | Oklo | NRC denied the 2022 application over information gaps | [**LicenseGap**](oklo-licensegap/) | [▶](oklo-licensegap/oklo-licensegap-demo.mp4) |
| 5 | Varda Space Industries | Capsule waited ~8 months for FAA, range and recovery to align | [**ReentryOps**](varda-reentry-planner/) | [▶](varda-reentry-planner/varda-reentry-planner-demo.mp4) |
| 6 | Airborne Capital | Paper records slow down lease-return audits | [**RecordsCheck**](airborne-recordscheck/) | [▶](airborne-recordscheck/airborne-recordscheck-demo.mp4) |
| 7 | Redwood Materials | Every incoming battery is different and must be routed by hand | [**IntakeIQ**](redwood-intake-triage/) | [▶](redwood-intake-triage/redwood-intake-triage-demo.mp4) |
| 8 | Abodu | Slow permits outside pre-approved cities, some unlawful denials | [**PermitPrecheck**](abodu-permit-precheck/) | [▶](abodu-permit-precheck/abodu-permit-precheck-demo.mp4) |
| 9 | Fervo Energy | Drilling is over 75% of well cost | [**ROP Copilot**](fervo-rop-copilot/) | [▶](fervo-rop-copilot/fervo-rop-copilot-demo.mp4) |
| 10 | Albedo | Ten-minute passes can't carry all the 10 cm imagery | [**DownlinkIQ**](albedo-downlink-triage/) | [▶](albedo-downlink-triage/albedo-downlink-triage-demo.mp4) |

## Quick start

```bash
git clone https://github.com/sseanyk/company-ai-solutions.git
cd company-ai-solutions
open south8-cellsync/index.html              # any tool's index.html
```

> [!TIP]
> Each tool's code is also a standalone zip on the [Releases page](https://github.com/sseanyk/company-ai-solutions/releases/latest).
> Append `?demo=1` to any tool's URL to play its scripted walkthrough.

## Repository structure

```text
company-ai-solutions/
├── shared/                 # style.css + demo.js used by every tool
├── south8-cellsync/        # each tool: index.html, app.js, README.md, <slug>-demo.mp4
├── jetson-loadlens/
├── hadrian-autoballoon/
├── oklo-licensegap/
├── varda-reentry-planner/
├── airborne-recordscheck/
├── redwood-intake-triage/
├── abodu-permit-precheck/
├── fervo-rop-copilot/
├── albedo-downlink-triage/
└── record.py               # re-records the clips
```

> [!IMPORTANT]
> The tools load `../shared/`. When sending one tool to someone, send its folder **and** `shared/`, keeping the layout.
> The demo clip in each folder plays on its own.

## Recording the videos

Requires Python with [Playwright](https://playwright.dev/python/), Google Chrome and `ffmpeg` (macOS, for VideoToolbox encoding).

```bash
python3 record.py                    # all ten clips + a joined reel in videos/
python3 record.py jetson-loadlens    # one clip
```

Each clip is written to `<slug>/<slug>-demo.mp4`. Frames come from Chrome's screencast API, so the video matches what the page drew.

## Scope and disclaimer

> [!NOTE]
> - All data is synthetic, and so are the drawings, records, rule sets and physics.
> - Company names identify whose publicly reported bottleneck each tool targets. None of these companies is affiliated
>   with this project or has reviewed it.
> - Where a production version would use an LLM or vision model (reading PDFs, drawings, labels), these tools use
>   deterministic parsers so they run offline and are reproducible. Each tool's README says what would change.
> - Regulatory content (NRC expectations, California ADU law, FAA Part 450, AS9102) is simplified for illustration, not advice.
