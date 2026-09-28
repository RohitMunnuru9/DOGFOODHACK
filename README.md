# DOGFOOD 2026

A self-hosted hackathon portal for teams, submissions, judging, community voting, and published results. The interface runs on Next.js 16; a Python standard-library API stores shared event data in SQLite. The portal starts with DOGFOOD fixture data and requires no hosted database, authentication provider, or API key at runtime.

## Start the portal

```bash
docker compose up --build
```

Open **http://localhost:8000/**. Set `DOGFOOD_PORT` to use another host port. Compose starts the portal and API and keeps SQLite data in the `portal_data` volume. The application can run without network access after the Docker images and npm packages needed for the initial build are available locally. `/health` reports API readiness.

For development without Compose, run these in separate terminals from the repository root:

```powershell
$env:HOST='127.0.0.1'; $env:PORT='8000'; python src/dogfood.py
```

```powershell
npm run dev
```

Then open **http://localhost:3000/**. Next.js forwards `/dogfood-api`, gallery, embed, and verification routes to the Python service.

## Explore the seeded events

The seed contains a historical fixture event (`evt_01`) with 41 project rows, 30 judges, incomplete review batches, and an intentional duplicate. Its submission deadline is closed. Three other events make the main workflows easy to try:

| Event | What to try |
| --- | --- |
| `evt_demo` | Create a team, save a draft, and submit a project |
| `evt_review_demo` | Sign in as Judge and submit an assigned review |
| `evt_vote_demo` | Vote and comment during an open community ballot |

The demo password is `dogfood-demo-2026`. Seeded accounts include `organizer@demo.local`, `participant@demo.local`, `marek.nowak@example.org`, and `priya.nair@example.org`. Sign in explicitly or create your own account. Workspace tabs retain your identity; they never log into another account. Organizers can invite a new account by email-specific link or grant an event role to an account already registered in the portal.

For a fresh instance without demo accounts, set `DOGFOOD_DEMO_MODE=0`, `DOGFOOD_ADMIN_EMAIL`, `DOGFOOD_ADMIN_PASSWORD` (at least 12 characters), and a new `DOGFOOD_DB` path. The configured admin account is created on first start.

## Features

- **Event operations:** create events, tracks, prizes, role invitations, teams of up to four, and project drafts. The server enforces event phases and deadlines on direct API requests.
- **Submissions and gallery:** project story, repository and demo links, images, tags, required organizer questions, track, public search and filtering, team invitations, and an embeddable submitted-project gallery.
- **Judging:** assign judges, version weighted rubrics, assign balanced batches within track scopes, save private criterion scores, view completion progress and individual reviews, normalize judge severity, publish a frozen result snapshot, and export CSV.
- **Community:** authenticated or email-bound invitation voting, randomized ballots, one vote per account, self-vote checks, comments, moderation, and an organizer activity log. Results stay hidden until the relevant event stage.
- **Integrations:** documented REST API, signed webhooks, JSON event archive/import, signed project certificates, and judge participation records.
- **Workspace:** white clay interface with account-based Participate, Judge, and Organize views, custom controls, and independently scrolling content.
- **Arcade:** six games with browser-local high scores and a leaderboard.
- **Landing page:** original clay illustrations and an embedded recording of the actual app.

The event workflows above use SQLite and server-side authorization. Arcade is available in every workspace; its scores are stored only in the current browser and do not affect judging results. Legacy dashboard components remain unmounted.

## API and data movement

OpenAPI is served at `/dogfood-api/openapi.json`; [API.md](API.md) explains payloads, lifecycle calls, errors, and webhook verification. Organizer exports are available as CSV and JSON. Full JSON archives restore into a new empty event, including rubric versions, reviews, votes, comments, roles, track scopes, custom questions, and published snapshots. IDs are remapped and accounts are matched by email. Unknown historical identities are locked until their owners use an organizer-issued invitation from the restored event to set a password. Passwords, sessions, and webhook secrets are never transferred. Original record payloads remain as provenance; published certificates are signed afresh by the destination server. Partial team/project JSON import remains available.

Webhooks use an HMAC-SHA256 body signature in `X-Dogfood-Signature`. The signing secret is shown once when a webhook is created. Failed deliveries can be retried on later writes or manually, up to three attempts. Published certificates and judge records have public verification URLs backed by the server's signing key; they are not independently verifiable offline.

## Verify

With the portal running:

```bash
python run.py .dogfood.toml
python -m unittest discover -s tests -v
node --test tests/local-store.test.mjs tests/openapi.test.mjs
npx playwright test
python scripts/normalization_report.py --check
npm run build
```

The checked-in [`acceptance-report.txt`](acceptance-report.txt) shows **7/7 PASS** for the published T1/T2 checks. `.dogfood.toml` claims T1–T4. The host checker contains no T3/T4 probes, so its automatic `verified` line stops at T2 and marks T3/T4 unverified; that is a limit of the published checker, not evidence that those tiers passed or failed. [TIER-EVIDENCE.md](TIER-EVIDENCE.md) maps every T3/T4 requirement to the implementation and separate regression coverage. Judges should inspect those behaviors and the limits below when evaluating the higher tier claim.

See [TESTING.md](TESTING.md) for Docker, offline-runtime, browser and persistence checks, and [DEMO.md](DEMO.md) for the updated product walkthrough and recording instructions.

## Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — services, authorization, and lifecycle
- [DATA-MODEL.md](DATA-MODEL.md) — schema, fixture import, and export
- [JUDGING.md](JUDGING.md) — assignments, scoring, and normalization
- [NORMALIZATION.md](NORMALIZATION.md) — arithmetic proof and reproducible fixture evidence
- [TIER-EVIDENCE.md](TIER-EVIDENCE.md) — T3/T4 requirement map, checks, and limits
- [THREAT-MODEL.md](THREAT-MODEL.md) — voting and review abuse controls
- [KICKOFF-NOTES.md](KICKOFF-NOTES.md) — event rules and implementation map

## Current limits

Authenticated voting alone cannot prevent a person creating multiple accounts. Invitation mode limits access to organizer-approved email-bound links, which organizers must distribute through a trusted channel; it does not send or verify email automatically. Rate limits apply per account. Public record verification needs the issuing server. Initial Docker builds need cached dependencies or internet access. Account recovery, optional pairwise judging, and production deployment hardening are not included. All mounted event workflows use the shared API.

The project is released under the [MIT license](LICENSE).
