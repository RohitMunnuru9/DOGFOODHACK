"""Align the supplied ElevenLabs narration paragraph by paragraph to the 4:59 demo.

The source boundaries were measured at quiet pauses in final speecg.mp3.
The target boundaries correspond to docs/submission-voiceover.md and the
actual actions in docs/submission-demo.mp4. Pass an MP3 path to reproduce.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FFMPEG = ROOT / "data" / "ffmpeg.exe"
if not FFMPEG.exists():
    FFMPEG = shutil.which("ffmpeg")
if not FFMPEG:
    raise SystemExit("FFmpeg is required; provide data/ffmpeg.exe or put it on PATH")

SOURCE_CUTS = [
    0.0, 37.23, 64.15, 99.56, 115.82, 137.22, 177.80, 203.66,
    214.45, 232.35, 240.54, 261.34, 272.53, 293.92, 307.23,
]
TARGET_CUTS = [
    0, 36, 60, 95, 112, 133, 172, 197, 207, 222, 232, 252,
    265, 288, 299,
]


def run(*args: object) -> None:
    subprocess.run(
        [str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", *map(str, args)],
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path, help="ElevenLabs MP3 for the timed script")
    parser.add_argument(
        "--output", type=Path, default=ROOT / "docs" / "submission-demo-final.mp4"
    )
    args = parser.parse_args()
    audio = args.audio.resolve()
    video = ROOT / "docs" / "submission-demo.mp4"
    if not audio.is_file() or not video.is_file():
        raise SystemExit("Audio or silent demo video is missing")

    # Each cut is in a quiet gap between two script paragraphs. Keep the
    # original voice speed when a paragraph is shorter than its screen time;
    # let the remaining time be a natural pause instead of stretching speech.
    source_labels = "".join(f"[s{i}]" for i in range(14))
    filters = [f"[1:a]asplit=14{source_labels}"]
    speeds: list[float] = []
    for i in range(14):
        source_start, source_end = SOURCE_CUTS[i : i + 2]
        target_duration = TARGET_CUTS[i + 1] - TARGET_CUTS[i]
        source_duration = source_end - source_start
        speed = max(1.0, source_duration / target_duration * 1.006)
        speeds.append(speed)
        filters.append(
            f"[s{i}]atrim=start={source_start:.3f}:end={source_end:.3f},"
            f"asetpts=PTS-STARTPTS,atempo={speed:.6f},aresample=48000,"
            f"apad,atrim=duration={target_duration},asetpts=PTS-STARTPTS[a{i}]"
        )
    joined = "".join(f"[a{i}]" for i in range(14))
    filters.append(
        f"{joined}concat=n=14:v=0:a=1,"
        "afade=t=in:st=0:d=0.25,afade=t=out:st=298.5:d=0.5[aout]"
    )
    run(
        "-i", video, "-i", audio,
        "-filter_complex", ";".join(filters),
        "-map", "0:v:0", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
        "-t", "299", "-movflags", "+faststart", args.output,
    )
    print("Output:", args.output)
    for i, speed in enumerate(speeds):
        print(
            f"{i + 1:2}: {TARGET_CUTS[i]:3}-{TARGET_CUTS[i + 1]:3}s "
            f"source {SOURCE_CUTS[i]:6.2f}-{SOURCE_CUTS[i + 1]:6.2f}s "
            f"tempo {speed:.3f}x"
        )


if __name__ == "__main__":
    main()
