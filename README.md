# DOGFOOD 2026

A self-hosted hackathon portal for teams, submissions, judging, community voting, and published results. The interface runs on Next.js 16; a Python standard-library API stores shared event data in SQLite. The portal starts with DOGFOOD fixture data and requires no hosted database, authentication provider, or API key at runtime.

## Start the portal

```bash
docker compose up --build
```

Open **http://localhost:8000/**. Compose starts the portal and API and keeps SQLite data in the `portal_data` volume. The application can run without network access after the Docker images and npm packages needed for the initial build are available locally. `/health` reports API readiness.

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
| `evt_review_demo` | Open Jury → Reviews and submit an assigned review |
| `evt_vote_demo` | Vote and comment during an open community ballot |

The demo password is `dogfood-demo-2026`. Seeded accounts include `organizer@demo.local`, `participant@demo.local`, `marek.nowak@example.org`, and `priya.nair@example.org`. Sign in explicitly or create your own account. Workspace tabs retain your identity; they never log into another account. Organizers can invite a new account by email-specific link or grant an event role to an account already registered in the portal.

For a fresh instance without demo accounts, set `DOGFOOD_DEMO_MODE=0`, `DOGFOOD_ADMIN_EMAIL`, `DOGFOOD_ADMIN_PASSWORD` (at least 12 characters), and a new `DOGFOOD_DB` path. The configured admin account is created on first start.

## Features

- **Event operations:** create events, tracks, prizes, role invitations, teams of up to four, and project drafts. The server enforces event phases and deadlines on direct API requests.
- **Submissions and gallery:** project story, repository and demo links, images, tags, track, public search and filtering, team invitations, and an embeddable submitted-project gallery.
- **Judging:** assign judges, version weighted rubrics, save private criterion scores, view completion progress and individual reviews, normalize judge severity, publish a frozen result snapshot, and export CSV.
- **Community:** randomized ballots, one vote per account, self-vote checks, comments, moderation, and an organizer activity log. Results stay hidden until the relevant event stage.
- **Integrations:** documented REST API, signed webhooks, JSON event archive/import, signed project certificates, and judge participation records.
- **Workspace:** account-based Participate, Judge, and Organize views using shared event data.

The event workflows above use SQLite and server-side authorization. Legacy browser-only dashboard and arcade components remain in the source tree but are not mounted in the submitted portal.

## API and data movement

OpenAPI is served at `/dogfood-api/openapi.json`. Organizer exports are available as CSV and JSON. Full JSON archives restore into a new empty event, including rubric versions, reviews, votes, comments, roles, track scopes, custom questions, and published snapshots. IDs are remapped and accounts are matched by email. Unknown historical identities are locked until their owners use an organizer-issued invitation from the restored event to set a password. Passwords, sessions, and webhook secrets are never transferred. Original record payloads remain as provenance; published certificates are signed afresh by the destination server. Partial team/project JSON import remains available.

Webhooks use an HMAC-SHA256 body signature in `X-Dogfood-Signature`. The signing secret is shown once when a webhook is created. Failed deliveries can be retried on later writes or manually, up to three attempts. Published certificates and judge records have public verification URLs backed by the server's signing key; they are not independently verifiable offline.

## Verify

With the portal running:

```bash
python run.py .dogfood.toml
python -m unittest discover -s tests -v
node --test tests/local-store.test.mjs
npm run build
```

The checked-in [`acceptance-report.txt`](acceptance-report.txt) shows **7/7 PASS** for the published T1/T2 checks. `.dogfood.toml` claims T1 and T2. The Python suite covers additional T1–T4 behavior, including role isolation, deadlines, judging, voting, records, archive import, and webhook signing. T3 and T4 do not have published acceptance probes, so their remaining limits are described here rather than included in the tier claim.

For a five-minute event walkthrough, use [DEMO.md](DEMO.md). A recording is a separate submission deliverable.

## Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — services, authorization, and lifecycle
- [DATA-MODEL.md](DATA-MODEL.md) — schema, fixture import, and export
- [JUDGING.md](JUDGING.md) — assignments, scoring, and normalization
- [THREAT-MODEL.md](THREAT-MODEL.md) — voting and review abuse controls
- [KICKOFF-NOTES.md](KICKOFF-NOTES.md) — event rules and implementation map

## Current limits

Community voting is tied to a local account without email verification, so one person could create multiple accounts. Rate limits apply per account. Some workspace panels and arcade leaderboards are browser-local. Email delivery, account recovery, and production deployment hardening are not included.

The project is released under the [MIT license](LICENSE).
