# Current Docker verification — 28 September 2026

The Docker gap from the earlier native verification is resolved. Application revision `548e40f` built and passed these checks with Docker Engine 29.8.0 and Compose v5.5.1. No application changes were required.

## Results

| Check | Result |
| --- | --- |
| Current API and Next production image builds | Passed |
| Fresh Compose startup and container health checks | Both healthy |
| Host checker through published portal port 18000 | 7/7 PASS; T1/T2 verified |
| Full official fixture comparison through packaged portal | Passed |
| Browser suite against production Docker portal | 25 passed |
| Python API suite inside Python 3.13 API container | 21 passed |
| Fresh offline startup using locally built images, no build or pull | Both healthy |
| Host checker through Next on internal-only network | 7/7 PASS; T1/T2 verified |
| Full fixture comparison on internal-only network | Passed |
| Outbound TCP from both API and portal to `1.1.1.1:443` | Refused with network-unreachable errors |
| Local HTML, bundled scripts/styles, artwork and captions on isolated network | 15 assets fetched successfully |
| Demo video on isolated network | Byte-range request returned 206 and the requested 1,024 bytes |
| Container restart after browser workflows | Exact row hashes unchanged in 10 data tables |
| Host checks and complete fixture comparison after restart | Passed |

The fixture comparison checks all 41 projects, 40 teams and memberships, 30 judge identities/scopes, 126 reviews and comments, and 378 criterion scores. The exported scores match an independent calculation. The historical deadline, duplicate exclusion and incomplete-review handling remain correct.

The browser suite exercised the full create–submit–judge–publish–export lifecycle, full fixture and large archive restoration, account continuity, voting invitations, clay controls, navigation, independent scrolling, desktop/mobile layout, landing images/video and all six arcade games.

Restart verification compared every row in `events`, `users`, `tracks`, `teams`, `team_members`, `projects`, `assignments`, `reviews`, `criterion_scores` and `result_snapshots`. The test instance retained 13 events, 389 projects, 253 reviews and its published result snapshot without changes. These totals include the extra events and archives created by the browser regressions. The historical fixture itself remains 41 projects and 126 reviews.

Receipts: [published-port checker](docker-current-acceptance-report.txt) and [offline checker](docker-current-offline-acceptance-report.txt). The root acceptance receipt has identical contents to the fresh published-port receipt.

## Isolation and reproducibility

The normal test used a new `dogfood-verify-0928` Compose project and volume:

```powershell
$env:DOGFOOD_PORT='18000'
docker compose -p dogfood-verify-0928 up -d --build --wait
python scripts/check_acceptance.py --base-url http://localhost:18000
python scripts/verify_host_fixtures.py --base-url http://localhost:18000
$env:DOGFOOD_TEST_URL='http://127.0.0.1:18000'
npx playwright test
```

The offline run used a separate fresh `dogfood-offline-0928` project and volume, `docker-compose.isolated-test.yml`, and a temporary image override pointing at the exact images just built. It started with `--no-build --pull never --wait`. Docker confirmed `Internal=true` on its sole network. The checker ran inside the API container with `base_url=http://portal:3000`, so requests still passed through the Next portal. The API and portal both independently failed outbound socket probes. No host-wide network settings were changed.

The tested image IDs were:

- API: `sha256:abdb1b896075c53bc075fddc9fbdf7f884fe30d88286ce7a1bab3b01d79992ea`
- Portal: `sha256:953da85cf07125d823dbc38e7cc6ab286bab1ba37363f421255b5344fd6f186e`

Offline runtime requires the images to exist locally; an initial build still needs its base images and npm dependencies available. The 25 browser tests used the normal published Docker port; offline checks exercised HTTP routes, data and asset delivery from within the isolated network, not a second full browser run.
