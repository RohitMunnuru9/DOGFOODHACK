# T3 and T4 evidence

The published `run.py` has seven probes for T1 and T2 and **none for T3 or T4**. The root `.dogfood.toml` claims all four tiers because the following workflows are implemented. Its `acceptance-report.txt` therefore says `verified T1 T2` and `claimed but not verified: T3 T4`. Higher-tier evidence comes from the API integration tests and the recorded browser run, not from that host checker.

| Requirement | Implementation | Regression evidence |
| --- | --- | --- |
| T3 voting access | Per-event authenticated or email-bound invitation policy; single-use expiring invitation tokens and event grants | `test_voting_policy_requires_email_bound_single_use_invitation` |
| T3 gallery comments | Project comments, duplicate-body check, per-account rate limit and organizer moderation | `test_t3_ballot_comments_privacy_and_abuse_controls` |
| T3 result embargo | Public judging and community results return 403 during voting; organizer can inspect progress; publication freezes and reveals results | `test_t3_ballot_comments_privacy_and_abuse_controls` |
| T3 randomized ballots | Eligible projects are shuffled on each ballot request | `test_t3_ballot_comments_privacy_and_abuse_controls` |
| T3 anti-abuse and audit | Unique vote per event/account, self-vote and duplicate-project exclusion, deadline checks, comment rate limits and organizer-readable audit actions for blocked attempts | `test_t3_ballot_comments_privacy_and_abuse_controls`; `test_voting_policy_requires_email_bound_single_use_invitation` |
| T4 REST API and webhooks | `src/openapi.json`, `API.md`, signed event webhooks and delivery status/retry controls | `tests/openapi.test.mjs`; `test_t4_signed_webhook_delivery` |
| T4 certificates and records | Project certificates and judge participation records issued on publication | `test_t4_archive_records_and_embeddable_gallery` |
| T4 signed public verification | HMAC signature checked by public `/verify/{id}` and `/api/records/{id}` endpoints | `test_t4_archive_records_and_embeddable_gallery` |
| T4 embeddable gallery | Public `/embed/events/{id}` iframe page | `test_t4_archive_records_and_embeddable_gallery` |
| T4 bulk data movement | JSON export and atomic full-event import restore roles, rubric, assignments, reviews, votes, comments, snapshots and relationships; CSV results export and partial import are also available | `test_full_archive_restores_fixture_history_and_locked_identities`; `test_large_archive_roundtrip_and_matching_export_limits` |

The relevant API tests are in `tests/test_portal.py`; the recorded production Docker browser run and offline checks are described in `docs/docker-verification-2026-09-28.md`. Reproduce the API and host checks with:

```bash
python -m unittest discover -s tests -v
python run.py .dogfood.toml
```

On 28 September, the API suite completed **21/21 tests**, the fixture comparison matched all 41 project rows and 126 reviews, and the unmodified host checker returned **7/7 PASS** through the running Next portal. That [portal receipt](docs/tier-claim-portal-acceptance-report.txt) records the T1–T4 claim and the checker’s T3/T4 limitation. Read-only requests through Next also returned 200 for the seeded ballot, organizer audit, full JSON archive, records list, embed and OpenAPI document. These checks do not replace an organizer's manual review of T3/T4.

The host checker can only confirm T1/T2 automatically. Voting is limited to one vote per account, not provably one per human. Invitation-only access depends on organizers sending links through a trusted channel; there is no automatic email verification. Records are publicly verifiable through the issuing server, not offline with a public key. Webhook delivery is synchronous, best-effort and retryable, without a background worker. The archive excludes passwords, sessions and webhook secrets by design; imported historical accounts require an organizer invitation to activate. See `THREAT-MODEL.md`, `ARCHITECTURE.md` and `API.md` for details.
