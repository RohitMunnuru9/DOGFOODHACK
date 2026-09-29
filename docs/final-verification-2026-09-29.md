# Final local verification — 29 September 2026

The repository was checked against running local API and Next.js servers before submission. The browser suite used an isolated SQLite database so it did not alter the normal preview.

| Check | Result |
| --- | --- |
| Published acceptance runner through `http://localhost:8000` | 7/7 PASS (T1/T2) |
| Project T3 regression tests | 2/2 PASS |
| Project T4 regression tests | 4/4 PASS |
| Python integration suite | 22 PASS |
| Node storage and OpenAPI tests | 3 PASS |
| Full Chrome browser suite | 25 PASS |
| Fixture import and result export comparison | PASS |
| Normalization evidence check | PASS |
| Next.js optimized production build | PASS |
| MP4/WebM decode, timing, black-gap and freeze check | PASS |

The lifecycle browser test previously had a sign-out timing race: it could click the signed-in Judge role control before the sign-in screen appeared. The helper now waits for sign-out to finish, clicks the Judge demo account on the sign-in screen, and waits for the workspace. The lifecycle test and then all 25 browser tests passed.

The published acceptance runner checks seven T1/T2 behaviors. T3/T4 results above are separate project tests and are not claimed as published checker results. Docker CLI was unavailable in this environment on 29 September, so containers were not rebuilt in this run. The prior packaged Docker verification is recorded in [docker-verification-2026-09-28.md](docker-verification-2026-09-28.md).
