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

## Submission-length recording

The host's [required deliverables](https://dogfoodhack.com/spec/) also call for a five-minute demo. The existing [five-minute lifecycle recording](docs/demo.webm) is preserved separately; it shows the preceding interface. The new landing-page preview above shows the current clay interface and does not replace that longer submission artifact.
