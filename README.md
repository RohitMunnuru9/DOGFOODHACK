# DOGFOOD 2026

**A self-hosted hackathon portal that takes an event from team formation to published results.** Participants submit projects, judges review them against a weighted rubric, organizers track progress, and the public can explore the gallery. The app runs locally with Next.js, a Python API, and SQLite.

[![Watch the 4:59 DOGFOOD walkthrough](public/landing/demo-poster.jpg)](https://www.youtube.com/watch?v=R15Ozwz467g)

**[Watch the 4:59 demo on YouTube](https://www.youtube.com/watch?v=R15Ozwz467g)** · [Download the same video](docs/submission-demo-final.mp4) · [Acceptance receipt](acceptance-report.txt) · [Verification](TESTING.md) · [MIT license](LICENSE)

## Run it

Install Docker with Compose and start the Docker engine. From a directory where you want to clone the project, run:

```bash
git clone https://github.com/RohitMunnuru9/DOGFOODHACK.git
cd DOGFOODHACK
docker compose up --build --wait
```

If you already have a checkout, run only `docker compose up --build --wait` from its root.

Open **http://localhost:8000/**. The portal starts with the official `fixtures.json`, three interactive demo events, and seeded demo accounts. Next.js and the Python API run in separate containers; SQLite is stored in a named volume and survives container restarts. Set `DOGFOOD_PORT` if port 8000 is already in use.

The first image build needs base images and npm packages available or cached. **Once built, the running portal needs no hosted database, authentication service, API, or CDN.** Offline startup, local media delivery, and restart persistence were exercised on an internal-only Docker network; see the [Docker verification](docs/docker-verification-2026-09-28.md). To restart with existing local images and no pull:

```bash
docker compose up --no-build --pull never --wait
```

Use `docker compose stop` to stop the services without removing their SQLite volume. Run the start command again to resume the same data.

## Explore a complete event

Use the **Organizer**, **Participant**, and **Judge** demo buttons on the sign-in page. The seeded role-specific accounts use password `dogfood-demo-2026`:

| Role | Email | Try this |
| --- | --- | --- |
| Organizer | `organizer@demo.local` | Create an event, configure questions and a rubric, assign judges, inspect progress, publish, and export. |
| Participant | `participant@demo.local` | Create a team, save a draft, submit, and browse the public gallery. |
| Judge A | `marek.nowak@example.org` | Open an assigned review and submit private rubric scores. |
| Judge B | `priya.nair@example.org` | Confirm judges cannot read each other's scores. |

For a shared preview login on a **native Python run**, add an ignored `data/demo-login.json` containing `{"email":"preview@example.org","password":"choose-a-private-password"}` and restart the API. That account can open all three workspaces and has an open judge assignment. This optional file is not copied into the Docker image; the role-specific accounts above work in Docker. The shared preview login is disabled when `DOGFOOD_DEMO_MODE=0`.

Choose an event that matches the action:

| Event | Purpose |
| --- | --- |
| **DOGFOOD Live Demo** (`evt_demo`) | Team creation, drafts, and submissions while the window is open. |
| **Live Judging Demo** (`evt_review_demo`) | An existing judge assignment ready for review. |
| **Community Vote Demo** (`evt_vote_demo`) | Shuffled ballots, voting, comments, and organizer moderation. |
| **Sample Hack 2026** (`evt_01`) | The official historical fixture. Its submission deadline is intentionally closed. |

The official fixture contains **8 tracks, 30 judges, 40 teams, 41 submission rows, and 126 reviews**. Its duplicate submission remains visible but is excluded from scoring; unfinished assignments stay unfinished. The original `2026-03-01T18:00:00Z` deadline is preserved. For a fresh end-to-end lifecycle, create a new event rather than changing the fixture. See the [guided walkthrough](DEMO.md).

The interactive event dates are set when a new demo database is seeded. An older saved volume can eventually pass those dates; create a new event for a fresh submission or voting window.

## What is implemented

| Tier | Working behavior | Evidence |
| --- | --- | --- |
| **T1 · Core** | Sessions and roles, events, team invitations, editable drafts, server-enforced deadlines, public searchable gallery. | Published checker: **3/3 PASS**. |
| **T2 · Judging** | Judge invitations and track scopes, balanced assignments, versioned weighted rubrics, private reviews, progress, normalization, CSV export. | Published checker: **4/4 PASS**. |
| **T3 · Public** | Authenticated or email-bound invitation voting, shuffled ballots, comments and moderation, result embargo, duplicate and self-vote controls, audit events. | Separate project regressions: **2/2 PASS**. |
| **T4 · Stretch** | Documented REST API, signed event webhooks, project certificates and judge records, public server verification, embed gallery, full event archive import/export. | Separate project regressions: **4/4 PASS**. |

The root [`.dogfood.toml`](.dogfood.toml) claims T1–T4. The organizer's unmodified [checker](run.py) makes **seven requests covering T1/T2 only**, so its [committed report](acceptance-report.txt) correctly says `verified T1 T2` and `claimed but not verified: T3 T4`. The [tier evidence map](TIER-EVIDENCE.md) lists the T3/T4 endpoints, tests, and limits; it is project evidence, not an organizer verdict.

## How it works

```text
Browser → Next.js portal → Python HTTP API → SQLite volume
                         ├─ server-side roles and deadlines
                         ├─ fixture import and event archives
                         ├─ judging, votes, and audit records
                         └─ signed webhook deliveries and records
```

The backend decides who may submit, review, vote, publish, and export. A judge's score endpoint checks the authenticated user against the requested judge; hiding a control in React is never the access rule. Browser sessions use HttpOnly cookies, while the published checker uses seeded bearer headers from `.dogfood.toml`.

Reviews use organizer-configured criterion weights. Within each track, **judge-mean shrinkage** adjusts a judge's average toward the track average according to how many reviews they completed. Missing reviews contribute no score, the duplicate is excluded, and publication freezes a result snapshot. The method, assumptions, and fixture ranking changes are in [JUDGING.md](JUDGING.md) and [NORMALIZATION.md](NORMALIZATION.md).

Full JSON export preserves event structure and history: teams, questions, rubric versions, assignments, reviews, votes, comments, audit entries, and published results. Import restores them into a **new empty event**, remapping IDs while preserving relationships. Passwords, sessions, webhook secrets, and signing keys do not travel with an archive. See [DATA-MODEL.md](DATA-MODEL.md), [ARCHITECTURE.md](ARCHITECTURE.md), and the [API guide](API.md).

## Verify the submission

With the seeded portal running on port 8000:

```bash
python scripts/check_acceptance.py
python -B scripts/check_upper_tiers.py
python -B scripts/verify_host_fixtures.py
python -B -m unittest discover -s tests -v
node --test tests/local-store.test.mjs tests/openapi.test.mjs
python -B scripts/normalization_report.py --check
npm run build
```

`check_acceptance.py` runs the exact organizer-supplied `run.py`, writes its stdout to `acceptance-report.txt`, and fails the shell if any of the seven checks fails. `check_upper_tiers.py` runs separate project-owned regressions and writes `tier-regression-report.txt`. Use `--base-url` with the two host scripts if you changed the portal port.

Browser tests create accounts and events, so use a disposable database or test instance. After `npm ci`, install Chromium with `npx playwright install chromium`, then run `npx playwright test`; by default it starts isolated local services. Set `DOGFOOD_TEST_URL` to test a running demo/test portal instead. The [29 September verification](docs/final-verification-2026-09-29.md) recorded **7/7** published checks, **22** Python tests, **3** Node tests, **25** browser tests, fixture and normalization comparisons, and an optimized Next.js build. The earlier [Docker verification](docs/docker-verification-2026-09-28.md) records packaged and offline checks for its stated revision.

## Develop without Docker

Use Node.js 22 and Python 3.11 or newer. Install JavaScript dependencies once with `npm ci`, then start these in separate terminals:

```powershell
$env:HOST='127.0.0.1'; $env:PORT='8000'; python src/dogfood.py
```

```powershell
npm run dev
```

Open **http://localhost:3000/**. Next.js forwards the API and public gallery routes to Python. Set `DOGFOOD_DB` before starting Python to use a separate SQLite file.

## Run a real event

Create a fresh Compose project and volume, turn off seeded demo accounts, and provide a private initial admin:

```powershell
$env:DOGFOOD_DEMO_MODE='0'
$env:DOGFOOD_ADMIN_EMAIL='you@example.org'
$env:DOGFOOD_ADMIN_PASSWORD='choose-at-least-12-characters'
docker compose -p dogfood-event up --build --wait
```

Replace the example email and password with your own values and use a previously unused Compose project name. Keep backups of the SQLite volume. Protect admin credentials and webhook secrets. Disabling demo mode on an **existing** volume does not delete accounts that were already seeded.

## Boundaries

Voting limits one vote per account, not provably one per person. Invitation links must be distributed by organizers; there is no automatic email service or password recovery. There is no anonymous open-link voting mode. Webhook delivery is synchronous and retryable, with no background worker. Record signatures are verified by the issuing server rather than independently offline. Pairwise judging is an optional challenge and is not implemented. Arcade scores stay in the current browser and never affect event results. The narrated video combines current interface footage with earlier lifecycle footage; the current workflow is also covered by the browser suite.

The [threat model](THREAT-MODEL.md) documents abuse controls and remaining risks. All source code is released under the [MIT license](LICENSE).
