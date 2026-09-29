# Recorded product walkthrough

[Watch or download the MP4](public/landing/demo.mp4) · [Download WebM](docs/landing-demo.webm)

The landing page embeds this updated **36.4-second** walkthrough at `/#watch-demo`. It records real browser actions against the optimized Next.js/Python application at **1440 × 900, 25 fps**. The video has on-screen explanations and an English caption track, with no audio. The illustrations on the landing page are generated artwork; all footage and the video poster show the actual app.

The recording demonstrates event setup, team creation, drafting, submitting, assigning a judge, private scoring, publication, CSV download, the public gallery, and Arcade. It uses separate organizer, participant, and judge accounts in a disposable demo database. Setup and account-switch waits happen outside captured scenes. Scenes are joined directly, unchanged holds are capped, and the encoder uses one consistent timebase, avoiding blank gaps or a lingering end frame. Recording captions are overlays, not product controls.

| Time | Scene |
| --- | --- |
| 0:00 | 01 / Good ideas. Great company. |
| 0:01 | 02 / The whole event, at a glance |
| 0:04 | 03 / Make room for your next event |
| 0:09 | 04 / Build a team. Tell your story. |
| 0:15 | 05 / Ready to share |
| 0:17 | 06 / Give every project a fair review |
| 0:19 | 07 / Thoughtful, private judging |
| 0:26 | 08 / Publish a result everyone can trust |
| 0:28 | 09 / Celebrate the work |
| 0:30 | 10 / A little room to play |
| 0:34 | DOGFOOD / Make something that matters |

The exact contiguous scene boundaries are in [docs/demo-timeline.json](docs/demo-timeline.json). [docs/demo-video-check.txt](docs/demo-video-check.txt) records complete decode checks, duration alignment, black-gap detection, and freeze detection for both encodings. Browser tests additionally play and seek the embedded MP4 on desktop and phone layouts.

## Reproduce

Use a disposable/demo instance: the recorder creates real event, team, project, and review data. Install Playwright Chromium and a full FFmpeg build supporting H.264 and VP9, then:

```powershell
$env:DOGFOOD_TEST_URL='http://127.0.0.1:14000'
$env:FFMPEG_PATH='C:/path/to/ffmpeg.exe'
node scripts/record-demo.mjs
node scripts/check-demo.mjs
```

Raw captured frames stay under ignored `test-results/demo-recording/`. Successful runs replace `public/landing/demo.mp4`, its poster and captions, `docs/landing-demo.webm`, and the timeline. Next standalone deployments must copy `public/` beside the server; the Dockerfile includes it. The video loads only when requested and never autoplays.

For a submission form requiring a hosted video service or direct upload, upload the MP4 or WebM and use the resulting link.

## Submission-length video and voiceover

[Watch or download the 4:59 MP4](docs/submission-demo.mp4) · [Read the timed voiceover](docs/submission-voiceover.md) · [Scene timeline](docs/submission-demo-timeline.json)

The silent submission video combines footage recorded from the current clay interface with feature and evidence slides. It covers T1 through T4 and gives a precise place to narrate each topic. The T3/T4 slides explain implemented workflows; they are not shown as live browser footage. The published checker verifies T1/T2 only, and the separate T3/T4 test counts are labeled project-owned. The old [five-minute lifecycle recording](docs/demo.webm), showing the preceding interface, remains available for reference.

To reproduce the silent cut, install Pillow and provide FFmpeg via `FFMPEG_PATH` or `data/ffmpeg.exe`, then run `python scripts/make_submission_video.py`. The script uses `public/landing/demo.mp4` as its recorded UI source and writes the MP4, timeline, and voiceover text. Add the recorded voiceover later as an audio track without changing the scene timings.
