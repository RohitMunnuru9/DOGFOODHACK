"""Render the silent DOGFOOD submission presentation from recorded current-UI footage.

Requires Pillow, the existing public/landing/demo.mp4, and FFmpeg. The output is
299 seconds with a matching voiceover script; no simulated product screens are
presented as live footage. Feature slides cite the implemented workflows.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "data" / "submission-video"
SLIDES = WORK / "slides"
CLIPS = WORK / "clips"
SOURCE = ROOT / "public" / "landing" / "demo.mp4"
OUTPUT = ROOT / "docs" / "submission-demo.mp4"
SCRIPT = ROOT / "docs" / "submission-voiceover.md"
TIMELINE = ROOT / "docs" / "submission-demo-timeline.json"
FFMPEG = Path(os.environ.get("FFMPEG_PATH", str(ROOT / "data" / "ffmpeg.exe")))
SIZE = (1600, 900)
FPS = 25

BG = "#f7f6f2"
INK = "#303934"
MUTED = "#697369"
RUST = "#b9765a"
SAGE = "#9aa982"
LINE = "#deded5"
WHITE = "#ffffff"
def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = (
        [Path("C:/Windows/Fonts/segoeuib.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")]
        if bold else
        [Path("C:/Windows/Fonts/segoeui.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")]
    )
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default(size=size)


SCENES = [
    dict(kind="slide", chapter="INTRO", title="The whole hackathon, in one place", seconds=12.00,
         badge="DOGFOOD 2026", image="landing", points=["Teams build and submit", "Judges review fairly", "Organizers publish with confidence"],
         voice="Meet DOGFOOD: a self-hosted portal for the complete hackathon journey. Teams form and submit projects, judges review against a clear rubric, and organizers can manage the event through published results."),
    dict(kind="clip", chapter="INTRO", title="Current portal in action", seconds=4.36, start=0.00,
         voice="This is the actual current interface, running locally."),
    dict(kind="slide", chapter="INTRO", title="Built to run anywhere", seconds=8.64,
         badge="ONE COMMAND", points=["Next.js interface", "Python API and SQLite", "Docker Compose startup"],
         voice="It runs locally with Docker Compose. Next.js serves the interface, Python handles the API and permissions, and SQLite keeps the event data portable."),

    dict(kind="clip", chapter="T1 / CORE", title="From event setup to submission", seconds=13.52, start=4.36,
         voice="First, an organizer creates an event with dates, tracks and prizes. A participant forms a team, writes a draft and submits a project."),
    dict(kind="slide", chapter="T1 / CORE", title="Event controls that matter", seconds=14.00,
         badge="ORGANIZER", image="event", points=["Configure dates, tracks and prizes", "Invite participants and judges", "Deadlines enforced by the server"],
         voice="The organizer controls event phases and deadlines from the settings view. The server enforces those deadlines, so a browser cannot simply submit after the cutoff."),
    dict(kind="slide", chapter="T1 / CORE", title="A real submission flow", seconds=13.00,
         badge="PARTICIPANT", image="draft", points=["Create or join a team", "Save an editable draft", "Submit when ready"],
         voice="Participants can build a team and save their project as a draft. They can return to edit it, then submit when the work is ready."),
    dict(kind="slide", chapter="T1 / CORE", title="Explore the official fixture", seconds=12.00,
         badge="PUBLIC GALLERY", image="overview", points=["40 teams and 41 project rows", "Search and track filters", "Duplicate retained, excluded from scoring"],
         voice="The public gallery loads the official fixture: forty teams and forty-one project rows. Visitors can search and filter submissions; the duplicate remains visible but does not distort results."),
    dict(kind="slide", chapter="T1 / CORE", title="Each role has a clear workspace", seconds=7.48,
         badge="ACCESS", points=["Organize", "Participate", "Judge"],
         voice="One account can switch workspaces, while the API still checks each event role."),

    dict(kind="clip", chapter="T2 / JUDGING", title="Assign, review, publish", seconds=12.20, start=17.88,
         voice="Judging begins with assignments. A judge sees their own project, enters rubric scores and feedback, and the organizer can publish a frozen result after the deadline."),
    dict(kind="slide", chapter="T2 / JUDGING", title="Thoughtful, private reviews", seconds=13.00,
         badge="JUDGE", image="review", points=["Assigned projects only", "Weighted rubric and comments", "Draft or submitted review state"],
         voice="Judges only see their assigned reviews. Each score follows a weighted rubric, and private comments give teams useful feedback without exposing other judges' work."),
    dict(kind="slide", chapter="T2 / JUDGING", title="Progress without peeking", seconds=12.00,
         badge="ORGANIZER", image="assign", points=["Track assignments and completion", "Protect peer scores", "Export results as CSV"],
         voice="Organizers can monitor assignment progress and export results. A judge cannot read a peer's private score, and a participant cannot access the review ledger."),
    dict(kind="slide", chapter="T2 / JUDGING", title="Fairer comparisons", seconds=12.80,
         badge="NORMALIZATION", points=["Weighted criterion totals", "Judge-mean shrinkage", "Frozen published snapshot"],
         voice="The result calculation documents weighted criteria and judge-mean normalization. Publication freezes the result snapshot so later edits do not quietly change the standings."),

    dict(kind="slide", chapter="T3 / COMMUNITY", title="Find Community Vote Demo", seconds=14.00,
         badge="WHERE TO CLICK", flow=["Participate", "Select event", "Community Vote Demo", "Community"],
         voice="For community voting, choose Participate, select Community Vote Demo in the Current Event dropdown, then open Community in the left navigation. This is the separate voting sample event."),
    dict(kind="slide", chapter="T3 / COMMUNITY", title="Controlled voting access", seconds=14.00,
         badge="VOTING", flow=["Organizer policy", "Signed-in or invited voter", "Shuffled ballot", "One recorded vote"],
         voice="The organizer chooses signed-in voting or an email-bound invitation. Eligible projects appear in a shuffled ballot, and each account can cast only one recorded vote."),
    dict(kind="slide", chapter="T3 / COMMUNITY", title="A conversation around projects", seconds=14.00,
         badge="COMMENTS", points=["Project discussion", "Organizer moderation", "Rate and duplicate controls"],
         voice="The same community area supports project comments. Organizers can moderate them, while duplicate and rate controls help keep the discussion useful."),
    dict(kind="slide", chapter="T3 / COMMUNITY", title="Results stay private until release", seconds=13.00,
         badge="EMBARGO", flow=["Voting open", "Private tally", "Organizer audit", "Published result"],
         voice="During voting, public tallies stay hidden. The organizer can inspect the audit trail for blocked attempts; visitors only see results after publication."),

    dict(kind="slide", chapter="T4 / INTEGRATIONS", title="Documented API and webhooks", seconds=14.00,
         badge="REST + HMAC", points=["OpenAPI document", "Event webhooks with signatures", "Delivery log and retry control"],
         voice="For integrations, the portal exposes a documented REST API and signed event webhooks. Organizers can inspect deliveries and retry pending ones."),
    dict(kind="slide", chapter="T4 / INTEGRATIONS", title="Records people can verify", seconds=14.00,
         badge="CERTIFICATES", points=["Project certificates", "Judge participation records", "Public server verification link"],
         voice="After publication, the portal can issue project certificates and judge participation records. Each record has a public verification link served by the issuing portal."),
    dict(kind="slide", chapter="T4 / INTEGRATIONS", title="Put the gallery anywhere", seconds=13.00,
         badge="EMBED", flow=["Published projects", "Embeddable gallery", "Website iframe"],
         voice="The public gallery can also be embedded in another site with an iframe, so an event can display its projects outside the organizer workspace."),
    dict(kind="slide", chapter="T4 / INTEGRATIONS", title="Your event data can move", seconds=14.00,
         badge="PORTABILITY", points=["Export full event JSON", "Restore into a new empty event", "Keep reviews, votes and comments linked"],
         voice="A full JSON archive can restore event history into a new empty event, including roles, rubric versions, reviews, votes and comments. Passwords and signing secrets stay out of the archive."),

    dict(kind="slide", chapter="PROOF", title="The checks are visible in the repo", seconds=18.00,
         badge="TEST EVIDENCE", proof=True,
         voice="The published DOGFOOD checker passes all seven of its T1 and T2 probes. Separate project regression tests pass two T3 and four T4 workflows. Those higher-tier tests are clearly labeled as our own, not organizer verification."),
    dict(kind="slide", chapter="PROOF", title="Clone. Start. Explore.", seconds=15.00,
         badge="PUBLIC SOURCE", command="docker compose up --build --wait",
         points=["Public GitHub repository", "SQLite data persists across restarts", "No hosted runtime required"],
         voice="The public repository includes the source, fixtures, architecture notes and test reports. A judge can start it with Docker Compose, and SQLite data survives a service restart."),
    dict(kind="clip", chapter="PROOF", title="A little room to play", seconds=6.28, start=30.08,
         voice="There is also an arcade for a small break between the serious work."),
    dict(kind="slide", chapter="FINISH", title="DOGFOOD 2026", seconds=14.72,
         badge="BUILD • REVIEW • CELEBRATE", image="outro", points=["One local portal", "Four implemented tiers", "A public repository to explore"],
         voice="DOGFOOD keeps the event journey together: build, review, vote and celebrate. The code and test evidence are in the public repository. Thank you for watching."),
]


def command(*args: str) -> None:
    subprocess.run([str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", *map(str, args)], check=True)


def text_lines(draw: ImageDraw.ImageDraw, value: str, max_width: int, text_font: ImageFont.FreeTypeFont) -> list[str]:
    words = value.split()
    lines, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and draw.textlength(candidate, font=text_font) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def draw_slide(scene: dict, index: int, position: float) -> Path:
    image = Image.new("RGB", SIZE, BG)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((48, 36, 1552, 864), radius=38, fill=WHITE, outline=LINE, width=2)
    draw.rounded_rectangle((77, 70, 232, 123), radius=16, fill="#f5e6de")
    draw.text((98, 79), "DOGFOOD", font=font(24, True), fill=RUST)
    draw.text((251, 80), "2026", font=font(23), fill=MUTED)
    draw.text((1450, 80), f"{index:02d}", font=font(23, True), fill=RUST)

    draw.rounded_rectangle((86, 171, 86 + min(375, 34 + 18 * len(scene["badge"])), 218), radius=22, fill="#e9efe2")
    draw.text((106, 177), scene["badge"], font=font(24, True), fill="#5c7254")
    title_font = font(58, True)
    y = 244
    for line in text_lines(draw, scene["title"], 570, title_font):
        draw.text((86, y), line, font=title_font, fill=INK)
        y += 68

    if scene.get("points"):
        y = max(y + 36, 410)
        for point in scene["points"]:
            draw.ellipse((90, y + 11, 105, y + 26), fill=RUST)
            for line in text_lines(draw, point, 500, font(28)):
                draw.text((125, y), line, font=font(28), fill=INK)
                y += 34
            y += 24

    if scene.get("image"):
        source = (WORK / "stills" / f"{scene['image']}.jpg")
        if source.is_file():
            still = Image.open(source).convert("RGB")
        else:
            still = Image.open(ROOT / "public" / "landing" / "build-together-clay.png").convert("RGB")
        if still.width == 1440:
            still = still.crop((0, 0, 1440, 790))
        target = (760, 502)
        ratio = max(target[0] / still.width, target[1] / still.height)
        still = still.resize((round(still.width * ratio), round(still.height * ratio)), Image.Resampling.LANCZOS)
        left = (still.width - target[0]) // 2
        top = (still.height - target[1]) // 2
        still = still.crop((left, top, left + target[0], top + target[1]))
        mask = Image.new("L", target, 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, target[0], target[1]), radius=27, fill=255)
        shadow = Image.new("RGBA", SIZE, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle((702, 207, 1478, 725), radius=30, fill=(48, 57, 52, 35))
        image = Image.alpha_composite(image.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(17)))
        image.paste(still, (710, 199), mask)
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((710, 199, 1470, 701), radius=27, outline="#dbddd4", width=2)
        draw.rounded_rectangle((1110, 710, 1470, 749), radius=16, fill="#f4f5ef")
        draw.text((1136, 716), "RECORDED FROM THE CURRENT UI", font=font(17, True), fill=MUTED)

    if scene.get("flow"):
        x, top = 700, 270
        for number, label in enumerate(scene["flow"], 1):
            draw.rounded_rectangle((x, top, 1460, top + 83), radius=23,
                                   fill=("#e9efe2" if number % 2 else "#f5e6de"))
            draw.text((x + 29, top + 18), f"{number:02d}", font=font(28, True), fill=RUST)
            draw.text((x + 112, top + 19), label, font=font(30, True), fill=INK)
            top += 108

    if scene.get("proof"):
        for top, label, score, detail in [
            (268, "PUBLISHED CHECKER", "7 / 7", "T1 and T2 probes pass"),
            (420, "PROJECT REGRESSIONS", "2 / 2", "T3 workflows pass"),
            (572, "PROJECT REGRESSIONS", "4 / 4", "T4 workflows pass"),
        ]:
            draw.rounded_rectangle((704, top, 1464, top + 126), radius=23, fill="#f3f5ef")
            draw.text((732, top + 18), label, font=font(20, True), fill=MUTED)
            draw.text((734, top + 51), detail, font=font(26), fill=INK)
            draw.text((1260, top + 27), score, font=font(48, True), fill=RUST)

    if scene.get("command"):
        draw.rounded_rectangle((702, 283, 1470, 407), radius=21, fill=INK)
        draw.text((730, 318), scene["command"], font=font(27, True), fill=WHITE)
        draw.text((712, 475), "github.com/RohitMunnuru9/DOGFOODHACK", font=font(27), fill=RUST)

    draw = ImageDraw.Draw(image)
    draw.text((87, 792), scene["chapter"], font=font(21, True), fill=RUST)
    draw.text((1372, 792), f"{int(position//60):02d}:{int(position%60):02d}", font=font(22), fill=MUTED)
    draw.rounded_rectangle((87, 830, 1511, 840), radius=5, fill="#e5e8df")
    draw.rounded_rectangle((87, 830, 87 + round(1424 * position / 299), 840), radius=5, fill=RUST)
    path = SLIDES / f"slide-{index:02d}.png"
    image.convert("RGB").save(path, optimize=True)
    return path


def stamp(seconds: float) -> str:
    minutes, sec = divmod(round(seconds), 60)
    return f"{minutes:02d}:{sec:02d}"


def main() -> None:
    if not SOURCE.is_file() or not FFMPEG.is_file():
        raise SystemExit("Current UI recording or FFmpeg is missing")
    SLIDES.mkdir(parents=True, exist_ok=True)
    CLIPS.mkdir(parents=True, exist_ok=True)
    still_dir = WORK / "stills"
    still_dir.mkdir(parents=True, exist_ok=True)
    for name, second in {"landing": .6, "overview": 3.0, "event": 7.0,
                         "draft": 13.2, "assign": 19.0, "review": 23.5,
                         "outro": 35.2}.items():
        command("-ss", str(second), "-i", SOURCE, "-frames:v", "1", "-q:v", "2",
                still_dir / f"{name}.jpg")
    duration = sum(scene["seconds"] for scene in SCENES)
    if abs(duration - 299) > .001:
        raise SystemExit(f"Expected 299 seconds, got {duration}")
    position = 0.0
    timeline = []
    clip_files = []
    for index, scene in enumerate(SCENES, 1):
        target = CLIPS / f"clip-{index:02d}.mp4"
        seconds = scene["seconds"]
        if scene["kind"] == "slide":
            slide = draw_slide(scene, index, position)
            command("-loop", "1", "-framerate", str(FPS), "-i", slide,
                    "-t", f"{seconds:.2f}", "-vf",
                    f"zoompan=z='min(zoom+0.00010,1.055)':d=1:s={SIZE[0]}x{SIZE[1]}:fps={FPS},format=yuv420p",
                    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
                    "-video_track_timescale", "25000", target)
        else:
            command("-ss", f"{scene['start']:.2f}", "-i", SOURCE,
                    "-t", f"{seconds:.2f}", "-vf",
                    f"scale={SIZE[0]}:{SIZE[1]}:force_original_aspect_ratio=decrease,"
                    f"pad={SIZE[0]}:{SIZE[1]}:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
                    "-r", str(FPS), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
                    "-video_track_timescale", "25000", target)
        timeline.append({"start": round(position, 2), "end": round(position + seconds, 2),
                         "chapter": scene["chapter"], "title": scene["title"], "kind": scene["kind"]})
        clip_files.append(target)
        position += seconds
        print(f"{index:02d}/{len(SCENES)} {stamp(position)} {scene['title']}", flush=True)

    playlist = WORK / "segments.ffconcat"
    playlist.write_text("ffconcat version 1.0\n" + "".join(
        f"file '{path.as_posix()}'\n" for path in clip_files), encoding="utf-8")
    command("-f", "concat", "-safe", "0", "-i", playlist, "-an", "-c", "copy", "-movflags", "+faststart", OUTPUT)

    lines = ["# DOGFOOD 2026 — voiceover for the silent submission video", "",
             "The video is 4:59, with no audio track. Read each paragraph over its matching scene. "
             "Speak naturally at about 125–135 words per minute and leave a short pause at each scene change.", "",
             "The visual material combines recorded current-UI actions with clearly labeled feature and evidence slides. "
             "T3/T4 slides explain implemented behavior; they are not presented as live screen capture.", ""]
    position = 0.0
    for scene in SCENES:
        lines += [f"## {stamp(position)}–{stamp(position + scene['seconds'])} · {scene['title']}", "",
                  scene["voice"], ""]
        position += scene["seconds"]
    lines += ["## Recording notes", "", "- Do not show passwords, session tokens, or webhook secrets.",
              "- Export your voiceover as WAV or MP3. It can be added as a separate audio track later.",
              "- The published checker confirms T1/T2 only; the T3/T4 test scores shown are project-owned regressions.", ""]
    SCRIPT.write_text("\n".join(lines), encoding="utf-8")
    TIMELINE.write_text(json.dumps({"duration": duration, "width": SIZE[0], "height": SIZE[1],
                                    "fps": FPS, "scenes": timeline}, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {OUTPUT} ({duration:.0f}s), {SCRIPT}, and {TIMELINE}", flush=True)


if __name__ == "__main__":
    main()
