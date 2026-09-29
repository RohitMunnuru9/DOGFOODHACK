"""Edit actual DOGFOOD portal footage into a five-minute silent walkthrough.

Inputs are the recorded browser sessions in public/landing/demo.mp4,
docs/demo.webm, and docs/community-demo.mp4. The result contains screen footage throughout.
Set FFMPEG_PATH to a full FFmpeg executable if it is not on PATH.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "data" / "screen-demo-edit"
WORK.mkdir(parents=True, exist_ok=True)
FFMPEG = os.environ.get("FFMPEG_PATH") or (
    str(ROOT / "data" / "ffmpeg.exe") if (ROOT / "data" / "ffmpeg.exe").exists() else shutil.which("ffmpeg")
)
if not FFMPEG:
    raise SystemExit("FFmpeg is required. Set FFMPEG_PATH or install it on PATH.")


def run(*args: object) -> None:
    subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *map(str, args)], check=True)


def duration(path: Path) -> float:
    result = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path)], text=True, capture_output=True)
    match = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", result.stderr)
    if not match:
        raise RuntimeError(f"Cannot read duration: {path}")
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


SOURCE = ROOT / "docs" / "demo.webm"
OPENING = ROOT / "public" / "landing" / "demo.mp4"
COMMUNITY = ROOT / "docs" / "community-demo.mp4"
OUTPUT = ROOT / "docs" / "submission-demo.mp4"
TIMELINE = ROOT / "docs" / "submission-demo-timeline.json"
DETAIL_START = 36.0
SPLIT = 248.0
DETAIL_SPEED = 1.235
TAIL_SPEED = 1.195
FADE = 0.50
TARGET = 299.0

opening = WORK / "screen-opening.mp4"
head = WORK / "screen-detail.mp4"
tail = WORK / "screen-tail.mp4"
source_duration = duration(SOURCE)
if source_duration <= SPLIT or not COMMUNITY.is_file() or not OPENING.is_file():
    raise SystemExit("The recorded source clips are missing or too short.")

run("-i", OPENING, "-vf", "fps=25,scale=1280:800:flags=lanczos,"
    "pad=1280:900:0:50:color=0xf7f6f2,setsar=1,format=yuv420p",
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-movflags", "+faststart", opening)

for start, length, speed, output in (
    (DETAIL_START, SPLIT - DETAIL_START, DETAIL_SPEED, head),
    (SPLIT, source_duration - SPLIT, TAIL_SPEED, tail),
):
    run("-ss", start, "-t", length, "-i", SOURCE,
        "-vf", f"setpts=PTS/{speed},fps=25,scale=1280:900,setsar=1,format=yuv420p",
        "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-movflags", "+faststart", output)

opening_duration = duration(opening)
head_duration = duration(head)
community_duration = duration(COMMUNITY)
second_offset = opening_duration + head_duration - 2 * FADE
third_offset = opening_duration + head_duration + community_duration - 3 * FADE
graph = (
    "[0:v]settb=AVTB,setsar=1,format=yuv420p[a];"
    "[1:v]settb=AVTB,setsar=1,format=yuv420p[b];"
    "[2:v]settb=AVTB,setsar=1,format=yuv420p[c];"
    "[3:v]settb=AVTB,setsar=1,format=yuv420p,"
    "tpad=stop_mode=clone:stop_duration=3[d];"
    f"[a][b]xfade=transition=fade:duration={FADE}:offset={opening_duration - FADE:.3f}[ab];"
    f"[ab][c]xfade=transition=fade:duration={FADE}:offset={second_offset:.3f}[abc];"
    f"[abc][d]xfade=transition=fade:duration={FADE}:offset={third_offset:.3f},format=yuv420p[v]"
)
run("-i", opening, "-i", head, "-i", COMMUNITY, "-i", tail,
    "-filter_complex", graph, "-map", "[v]", "-t", TARGET, "-r", "25",
    "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUTPUT)

TIMELINE.write_text(json.dumps({
    "duration": duration(OUTPUT),
    "format": "silent screen recording edit",
    "size": "1280x900",
    "fps": 25,
    "sourceFootage": ["public/landing/demo.mp4", "docs/demo.webm", "docs/community-demo.mp4"],
    "sections": [
        {"start": 0, "end": round(opening_duration, 2), "content": "Current interface recording: lifecycle preview"},
        {"start": round(opening_duration - FADE, 2), "end": round(opening_duration + head_duration - FADE, 2), "content": "Actual browser recording: event setup, team, submission, judging, results"},
        {"start": round(second_offset, 2), "end": round(second_offset + community_duration, 2), "content": "Current interface recording: vote, comment, moderation, organizer access"},
        {"start": round(third_offset, 2), "end": TARGET, "content": "Actual browser recording: verified records, archive, embed, webhooks, public gallery"},
    ],
}, indent=2) + "\n", encoding="utf-8")
print(f"Saved {OUTPUT} ({duration(OUTPUT):.2f} seconds)")
