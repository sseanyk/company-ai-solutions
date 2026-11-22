"""Record each tool's autoplay demo to MP4, then join them into one reel.

Usage:  python3 record.py [slug ...]      (no args = all ten)
Each clip is written to <slug>/<slug>-demo.mp4; the joined reel goes to videos/all_10_demos.mp4.
Needs:  playwright (python) driving the installed Google Chrome, and ffmpeg on PATH.
"""
import base64
import shutil
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "videos"
SLUGS = [
    "south8-cellsync", "jetson-loadlens", "hadrian-autoballoon", "oklo-licensegap",
    "varda-reentry-planner", "airborne-recordscheck", "redwood-intake-triage",
    "abodu-permit-precheck", "fervo-rop-copilot", "albedo-downlink-triage",
]
SIZE = {"width": 1280, "height": 720}
TIMEOUT_S = 240


def record(slug: str) -> Path:
    """Capture frames with Chrome's screencast API, then encode with the system ffmpeg."""
    tmp = OUT / f"_raw_{slug}"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    frames: list[tuple[float, Path]] = []
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        ctx = browser.new_context(viewport=SIZE)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        cdp = ctx.new_cdp_session(page)

        def on_frame(ev: dict) -> None:
            path = tmp / f"f{len(frames):06d}.jpg"
            path.write_bytes(base64.b64decode(ev["data"]))
            frames.append((ev["metadata"]["timestamp"], path))
            cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})

        cdp.on("Page.screencastFrame", on_frame)
        cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 88,
                                          "maxWidth": SIZE["width"], "maxHeight": SIZE["height"]})
        page.goto((ROOT / slug / "index.html").as_uri() + "?demo=1")
        start = time.time()
        while not page.evaluate("window.__demoDone === true"):
            if time.time() - start > TIMEOUT_S:
                raise RuntimeError(f"{slug}: demo did not finish in {TIMEOUT_S}s")
            page.wait_for_timeout(200)
        page.wait_for_timeout(300)
        demo_err = page.evaluate("window.__demoError || null")
        cdp.send("Page.stopScreencast")
        ctx.close()
        browser.close()
    if errors or demo_err:
        raise RuntimeError(f"{slug}: page errors: {errors} {demo_err}")
    if len(frames) < 2:
        raise RuntimeError(f"{slug}: no frames captured")
    # Screencast only emits frames on change, so give each frame its real on-screen duration.
    lines = []
    for (t, path), (t_next, _) in zip(frames, frames[1:] + [(frames[-1][0] + 1.0, None)]):
        lines.append(f"file '{path.name}'\nduration {max(t_next - t, 0.001):.4f}\n")
    lines.append(f"file '{frames[-1][1].name}'\n")
    (tmp / "frames.txt").write_text("".join(lines))
    mp4 = ROOT / slug / f"{slug}-demo.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "frames.txt",
                    "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30",
                    "-c:v", "h264_videotoolbox", "-b:v", "6M", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(mp4)],
                   check=True, cwd=tmp)
    shutil.rmtree(tmp)
    print(f"recorded {mp4.name} ({len(frames)} frames)")
    return mp4


def reel(mp4s: list[Path]) -> None:
    lst = OUT / "_list.txt"
    lst.write_text("".join(f"file '{m}'\n" for m in mp4s))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                    "-c", "copy", str(OUT / "all_10_demos.mp4")], check=True, cwd=OUT)
    lst.unlink()
    print("wrote all_10_demos.mp4")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    chosen = sys.argv[1:] or SLUGS
    done = [record(s) for s in chosen]
    if not sys.argv[1:]:
        reel(done)
