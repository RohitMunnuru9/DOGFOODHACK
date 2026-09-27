# Five-minute lifecycle recording

[Watch or download the recorded demo](docs/demo.webm) (WebM, 1280 × 900, 5 minutes 5 seconds, on-screen captions, no audio).

The recording shows real browser actions against the Docker build. It creates one event and follows separate organizer, participant and judge accounts through the whole lifecycle. Captions explain the rules; they are recording overlays, not product controls.

| Time | What is shown |
| --- | --- |
| 0:00 | Local portal and explicit account sign-in |
| 0:15 | Event creation with dates, a track and a prize |
| 0:40 | Event judge role and track-scope controls |
| 1:05 | Participant team creation |
| 1:25 | Project story and private draft |
| 1:55 | Submission and public gallery |
| 2:15 | Balanced judge assignment |
| 2:40 | Private weighted review |
| 3:10 | Saved scores and normalization explanation |
| 3:30 | Organizer progress and review completion |
| 3:55 | Close submissions and publish a frozen result |
| 4:15 | Download CSV and show archive controls |
| 4:35 | Verify a signed participation certificate |
| 4:48 | Public results without signing in |

To reproduce it against a running disposable demo instance:

```powershell
npm ci
npx playwright install chromium
$env:DOGFOOD_TEST_URL='http://127.0.0.1:18000'
node scripts/record-demo.mjs
```

The recorder takes about five minutes, creates real demo data, asserts key workflow outcomes, and saves `docs/demo.webm`. Use the actual Compose port for `DOGFOOD_TEST_URL`. The same lifecycle is covered by a faster automated browser test. The host acceptance receipts and broader test commands are in [TESTING.md](TESTING.md).

Submit the public repository link together with this video link. If the organizer's submission form requires a hosted video service or direct upload, upload this file there and use the resulting link.
