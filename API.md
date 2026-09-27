# REST API

The machine-readable contract is [src/openapi.json](src/openapi.json), served at `/api/openapi.json` and `/dogfood-api/openapi.json`. Both prefixes reach the same service through Next.js. IDs are opaque strings; timestamps include their timezone. Send JSON with `Content-Type: application/json`.

## Authentication and errors

`POST /api/register` accepts `name`, `email`, and `password` (10 or more characters). `POST /api/login` accepts `email` and `password`. Both set an HttpOnly, SameSite=Strict session cookie. Send it on subsequent requests. `POST /api/logout` revokes that session. `GET /api/me` returns the current identity and event roles. Seed tokens in `.dogfood.toml` are for the local demonstration and checker; requests may use `Authorization: Bearer TOKEN` instead of a cookie.

Errors are JSON with an `error` message: 401 requires sign-in, 403 denies role/ownership or a closed operation, 404 means missing resource/invite, 409 means state conflict, 422 means invalid input, and 429 means rate-limited. Never infer permission from a visible button: the API checks it again.

## Lifecycle

1. An organizer creates an event with `POST /api/events` (`name`, `starts_at`, `submissions_close`, `tracks`, `prizes`). Use the returned `id` for the following routes.
2. Add questions with `PUT /api/events/{event_id}/questions`, for example `{"questions":[{"code":"problem","label":"What problem do you solve?","required":true}]}`. Questions lock after the first submitted project. Drafts may leave required answers empty; submission may not.
3. Participants create a team with `POST /api/events/{event_id}/teams`, then a draft with `POST /api/events/{event_id}/projects`. Include `team_id`, `track_id`, `title`, and story fields. `custom_answers` maps question codes to strings. Update with `PATCH /api/projects/{project_id}`, then `POST /api/projects/{project_id}/submit`.
4. Grant an existing account a judge role using `POST /api/events/{event_id}/roles` with `email`, `role:"judge"`, and optional `track_ids`. `null` allows all tracks; `[]` permits none. Alternatively issue `/role-invites` and privately distribute its email-bound link. The recipient signs in or registers and accepts it.
5. `POST /api/events/{event_id}/assignments/batch` with `{"reviews_per_project":3}` fills assignment gaps, balances workload, respects track scopes and team conflicts, and returns shortages. Explicit assignments use `/assignments`. Repeating a batch does not duplicate assignments. `/progress` includes judges with zero assignments.
6. Judges read `/api/judges/{judge_id}/scores`, then `PUT /api/assignments/{assignment_id}/review` with `{"scores":{"impact":4,"craft":3,"clarity":5},"comment":"Review notes","submit":true}`. Use the actual criterion codes and bounds returned by the assignment. Each review remains bound to its rubric version. A judge cannot read another judge's private scores.
7. Organizers preview `/results`, close submissions using `PATCH /api/events/{event_id}`, and `POST /publish` after any voting window closes. Publication freezes normalized results and issues records. `/results` becomes public, while `/export.csv` and `/export.json` remain organizer-only.

Project tracks may change before judges are assigned. After the first assignment, changing `track_id` returns 409 so existing reviews cannot count toward a different track. Project responses expose `track_locked`; other project fields remain editable until submissions close. Sending the unchanged track remains valid.

## Community access

Set `/api/events/{event_id}/voting-policy` to `{"mode":"authenticated"}` or `{"mode":"invitation"}` before the first vote. In invitation mode create `/voter-invites` with an email and distribute the returned link yourself. The recipient accepts with `POST /api/voter-invites/{token}/accept` while signed into that email's account. This is controlled invitation distribution, not automated email verification. `/ballot` randomizes submitted, nonduplicate projects; `/votes` accepts a `project_id`. The service rejects second votes and team self-votes, logs abuse, and hides totals until publication (organizers may inspect them after voting closes).

## Archives

Export `/api/events/{event_id}/export.json`. Restore that complete `dogfood-event-v1` object with `POST /api/events/{empty_event_id}/import.json`. Create an empty event first. Restoration is atomic; IDs are remapped, duplicate links and review/rubric relationships preserved, and a nonempty destination is rejected. Existing accounts match by email. New historical identities are locked; issue a role invitation from the restored event so the matching owner can register with that token and set a password. Credentials, sessions and webhook secrets never transfer. Published records are reissued under the destination key; original records are retained as provenance. A partial `teams`/`projects` import is also supported; it does not restore judging history.

## Webhooks and records

Create `/api/events/{event_id}/webhooks` with `{"url":"https://your-receiver.example/events"}`. Store the returned hexadecimal `secret` securely; it is shown only once. Every event audit entry queues JSON containing `id`, `event_id`, `action`, `at`, `actor_id`, `target_id`, and `detail`. Verify **raw request bytes**, before parsing JSON:

```python
expected = "sha256=" + hmac.new(bytes.fromhex(secret), raw_body, hashlib.sha256).hexdigest()
valid = hmac.compare_digest(expected, request_signature)
```

`request_signature` is `X-Dogfood-Signature`. Deduplicate by `X-Dogfood-Delivery`. Delivery occurs after the database transaction commits. Failed deliveries retry on subsequent writes or the organizer retry endpoint, up to three attempts. There is no independent background worker, delivery guarantee, or automatic email sender. Receivers should respond promptly with 2xx. An offline deployment retains undelivered entries.

Published project certificates and judge records use HMAC-SHA256 under the local database signing key. `/api/records/{record_id}?sig=...` verifies a record, and `/verify/{record_id}?sig=...` presents it. This requires the issuing server; it is not offline public-key verification. Protect the database and its signing key together.
