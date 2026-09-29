# Verification

The latest local check is the [29 September final verification](docs/final-verification-2026-09-29.md): 7/7 published T1/T2 checks, 2/2 T3 and 4/4 T4 project regressions, 22 Python tests, 3 Node tests, 25 Chrome browser tests, fixture and normalization comparisons, production build, and demo-media validation. Docker could not be rerun in that environment; the packaged verification below remains the latest Docker result.

Latest Docker result: the [28 September Docker verification](docs/docker-verification-2026-09-28.md) passed on the packaged app, including 25 browser tests, 21 containerized API tests, both normal and offline 7/7 host checks, full fixture comparisons, local media delivery and restart persistence. This resolves the Docker availability limitation recorded in the earlier native UI checks below. The submission now claims T1–T4; the published checker has probes only for T1/T2, and [TIER-EVIDENCE.md](TIER-EVIDENCE.md) lists the separate T3/T4 evidence and limits.

Run `python scripts/check_upper_tiers.py` for a fresh, separately labeled T3/T4 regression receipt. It currently executes two T3 tests and four T4 tests from the isolated Python integration suite and writes `tier-regression-report.txt`. It is project evidence, not an extension of the published acceptance checker.

The published host checker is unchanged. Run it directly with `python run.py .dogfood.toml`. It prints failures but does not reliably signal them through its exit status. `python scripts/check_acceptance.py` preserves its output and additionally exits nonzero unless all seven checks pass. An alternate port is supported with `--base-url http://localhost:18000`; the actual origin remains visible in the report.

## Packaged application

```powershell
$env:DOGFOOD_PORT='18000' # Optional; default is 8000.
docker compose -p dogfood-audit up -d --build --wait
python scripts/check_acceptance.py --base-url http://localhost:18000
$env:DOGFOOD_TEST_URL='http://127.0.0.1:18000'
npx playwright test
```

Both containers have readiness checks. Compose retains SQLite in a named volume across restarts. Use a separate Compose project for test data. The browser suite creates real accounts and events in its target database, so point it at a demo/test instance. Without `DOGFOOD_TEST_URL`, Playwright creates isolated local Python/Next servers and a temporary database on ports 18080/13000.

## Runtime without internet

Initial image builds require the base images and npm packages, or a previously populated local cache. Once built, the application has no hosted runtime dependency. The isolated test override removes outbound routing; on Docker Desktop this also makes published host ports unavailable. Run the checker **inside** the isolated network:

```powershell
docker compose -p dogfood-isolated -f docker-compose.yml -f docker-compose.isolated-test.yml build
docker compose -p dogfood-isolated -f docker-compose.yml -f docker-compose.isolated-test.yml up -d --no-build --pull never --wait
docker compose -p dogfood-isolated cp run.py api:/tmp/run.py
```

Copy a temporary `.dogfood.toml` whose `base_url` is `http://portal:3000` into the API container at `/tmp/dogfood.toml`, then:

```powershell
docker compose -p dogfood-isolated exec -T api python /tmp/run.py /tmp/dogfood.toml --fixtures /app/fixtures.json
```

[docs/offline-acceptance-report.txt](docs/offline-acceptance-report.txt) contains the resulting unmodified checker output: 7/7 PASS. During this verification the Docker network's `Internal` property was true and a socket connection from the API container to `1.1.1.1:443` was rejected. Requests still passed through the actual Next portal to its API. Default Compose publishes the browser port normally; disconnecting the host internet does not remove that local port.

## Regression coverage

For the fresh website downloads and complete fixture comparison, see [the 28 September verification](docs/host-fixture-verification-2026-09-28.md). `python scripts/verify_host_fixtures.py --base-url http://localhost:8000` checks every imported fixture record and independently recalculates all CSV scores against a running demo/test instance.

```powershell
python -B -m unittest discover -s tests -v
node --test tests/local-store.test.mjs tests/openapi.test.mjs
python -B scripts/normalization_report.py --check
npx playwright test
npm run build
```

The Python suite covers ownership, roles, deadlines, track scopes, assignment balance, required answers, rubric versions, normalization, publication, invitation-gated voting, abuse, archive restoration, webhooks, and signed records. Browser tests cover account continuity, event switching with delayed responses, assignment shortfalls, questions, archive upload, voting invitations, and a complete create–submit–judge–publish–export lifecycle. The lifecycle also captures desktop and phone screenshots, checks for page errors and horizontal page overflow, and compares public scores with the expected result.

The root acceptance receipt was generated against Compose on port 18000 because a separate development server occupied port 8000 on the test host. The checked-in default configuration still uses port 8000. The published checker certifies its seven T1/T2 probes; broader tests provide additional evidence, not a guarantee that every possible input or deployment is correct.

## Recorded verification on 27 September 2026

| Check | Result |
| --- | --- |
| Unmodified host checker through Docker's published port | 7/7 PASS |
| Unmodified host checker through Next on an internal Docker network | 7/7 PASS |
| Python API integration suite | 17 passed |
| Browser suite against the final production Docker build | 10 passed |
| Node storage regressions and OpenAPI validation | 3 passed |
| Fixture normalization evidence regeneration | Exact match |
| Production Docker image builds | API and portal succeeded |
| Container restart | All 13 events then present retained; fixture projects remained 41 |
| Public repository metadata | Public, main branch, MIT license |

Each fix was committed and pushed separately, with its affected checks repeated after the push. Browser issues found during the combined run were fixed and the combined run repeated successfully. These are observed results from this environment; optional pairwise judging, automatic email delivery and independent offline certificate verification remain outside the implemented scope.

## White clay redesign verification

The subsequent UI makeover passed 18 browser regressions against the optimized Next standalone server, 21 Python API tests, 3 Node storage/OpenAPI checks, the fixture normalization comparison, and all 7 unmodified host acceptance probes. `npm run build` succeeded. Browser coverage includes keyboard dropdowns, multi-select tracks, calendar date/time submission, invalid-date feedback, number steppers, cursor response, loading skeletons, reduced motion, rapid navigation, draft preservation, public gallery filtering, and all existing account/submission/judging/publication workflows.

Every organizer section was checked at a 390px viewport for horizontal overflow; desktop and mobile screenshots were also inspected. The actual interface and its control behavior are described in [docs/clay-ui.md](docs/clay-ui.md).

These redesign checks used a separate temporary database with the Python API on port 8000 and the production Next server on port 14000. Docker Desktop was unavailable during this pass, so the updated container image was not rebuilt or reverified; the earlier Docker results above describe the preceding version.

Arcade restoration adds two browser regressions, bringing the suite to 20 tests. They launch and start all six games, verify canvas/3D rendering surfaces, exercise return controls and focus, open the leaderboard, read a previously saved score after reload, and check every role plus the phone layout. The existing browser-local score storage and its Node regression remain unchanged.

The workspace scroll fix adds three viewport regressions (1440×800, 1024×600, and 390×844), bringing the suite to 23 tests. Real wheel input checks all eight sections: content scrolls while header/sidebar coordinates and document scroll stay unchanged, section changes start at the top, and the last navigation item remains reachable on short screens.

Landing media adds two browser regressions (1440px desktop and 390px phone), bringing the suite to 25 tests. They decode both illustrations, follow the demo link, play and seek the real MP4, verify byte-range serving and captions, and check for horizontal overflow and page errors. `scripts/check-demo.mjs` decodes MP4 and WebM completely, validates contiguous chapter timings against encoded duration, and rejects black gaps of 0.15 seconds or longer or detected freezes of 2.5 seconds or longer. The saved results are in [docs/demo-video-check.txt](docs/demo-video-check.txt). Docker packaging includes the new public assets; Docker Desktop remains unavailable for a container rebuild in this environment.
