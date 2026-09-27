# Host fixture verification — 28 September 2026

Tested application revision: `29abb9a`. No application fixes were needed in this pass.

## Reference files

Downloaded fresh copies from the [host specification](https://dogfoodhack.com/spec/):

| File | SHA-256 of downloaded bytes |
| --- | --- |
| [run.py](https://dogfoodhack.com/spec/run.py) | `aa98963841bc8e18e8e5d76f0499697c093dd3c0055f9d73a459f592f4dcf09d` |
| [fixtures.json](https://dogfoodhack.com/spec/fixtures.json) | `252896bc45d49fca69ad413be40c6bfde9d9b9f9dd8db702b3ff74eaaa181121` |

Both files match the repository copies after normalizing CRLF/LF line endings. The freshly downloaded checker was executed unmodified with the freshly downloaded fixture. Only the configuration's base URL was overridden for the isolated local instance.

The official input has 8 tracks, 30 judges, 40 teams, 41 submission rows, and 126 reviews containing 378 criterion values. The extra submission is the intentional duplicate `prj_41` of `prj_07`. Its four reviews remain stored but are excluded from scoring.

## Runtime and results

A new, initially empty SQLite database was seeded directly from the downloaded fixture through `DOGFOOD_FIXTURES`. The Python service used port 18180; a separate optimized Next standalone build used port 14100 and forwarded requests to that service. The existing preview database was not used. Browser tests created additional events only in this test database.

| Check | Observed result |
| --- | --- |
| Fresh unmodified host checker through the production Next portal | 7/7 PASS; T1 and T2 verified |
| Every fixture event field, track, judge identity/scope, team and membership | Matches |
| All 41 submitted projects, source fields, duplicate flags and public detail pages | Matches |
| All 126 stored reviews, comments and 378 individual criterion values | Matches |
| All 41 exported CSV rows compared with an independent calculation from fixture input | Matches within `1e-12` absolute tolerance |
| Duplicate handling | Preserved with empty scores; 40 projects scored using 122 eligible reviews |
| Incomplete reviews | 8 pending assignments remain without fabricated reviews; scored coverage is 2–5 reviews per project |
| Constant-score judge | One judge/track group with multiple identical raw scores; all final scores finite and within 1–5 |
| Anonymous CSV and full archive export | Refused |
| Historical fixture deadline | Preserved as `2026-03-01T18:00:00Z` |
| Python API integration suite with downloaded fixture | 21 passed |
| Browser regressions against this production instance | 25 passed |
| Node storage and OpenAPI checks | 3 passed |
| Committed normalization evidence | Exact match |
| Production build | Passed |
| Rerun of startup seeding after browser workflows | All rows unchanged across 10 data tables, including 13 events, 389 projects and 253 reviews |

Browser coverage includes account continuity, all six arcade games, full fixture archive restoration, large archives, clay controls, navigation, desktop/mobile layout, independent sidebar scrolling, landing media, judging assignments, required questions, voting invitations, and creating, submitting, judging, publishing and exporting an event.

The additional verifier deliberately does not import application scoring functions. It recomputes the documented judge-mean shrinkage from the original input. Negative checks confirmed that it rejects an altered project title and an altered criterion score. The unchanged host checker was rerun after the browser workflows.

The fresh checker receipt is [host-reference-acceptance-report.txt](host-reference-acceptance-report.txt). The root receipt remains the earlier Docker run, as described in [TESTING.md](../TESTING.md).

## Reproduce the additional fixture check

After starting a seeded demo/test instance, run:

```powershell
python scripts/verify_host_fixtures.py --base-url http://localhost:8000 --fixtures fixtures.json
```

To test a newly downloaded fixture instead, set `DOGFOOD_FIXTURES` to that file before starting the Python service, use a new `DOGFOOD_DB` path, and pass the same file to this verifier and the host checker. Keep the historical fixture event unchanged; create separate events for interactive lifecycle tests.

## Remaining deployment verification

**Resolved in the subsequent [Docker verification](docker-verification-2026-09-28.md).** The paragraph below records the limitation at the time of this native test run.

Docker Desktop's Linux engine was unavailable: `docker info` failed because `dockerDesktopLinuxEngine` could not be found. Consequently, this native run did **not** certify Docker images or offline Compose startup. The subsequent Docker pass rebuilt the application and completed the Compose and isolated-network checks.

The published host checker verifies seven specific T1/T2 behaviors. These passing results and the broader regressions are evidence for the tested behavior, not a guarantee of every possible input or deployment, and do not certify T3/T4.
