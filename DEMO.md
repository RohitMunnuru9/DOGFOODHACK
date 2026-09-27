# Five-minute portal walkthrough

This is a recording script for the local portal. Start the two services or `docker compose up --build`, then open the portal. Keep the recording on one newly created event so the lifecycle is clear.

1. **0:00–0:40 — Start and create.** Show `/health`, the public `/projects` gallery, and Admin → Events. Create an event with a start time in the past, submissions closing at least 20 minutes in the future, one track, and one prize. The new event receives a default weighted rubric.
2. **0:40–1:30 — Team and project.** Switch to Contestant → Submit, select the new event, create a team, save a project draft with title, summary, track, repository URL, and optional media/tags. Open the draft, then use **Submit project**. Return to the gallery and show that the project is public.
3. **1:30–2:30 — Assign and review.** Switch to Admin → Events and select the new event. Under **Add an existing account**, grant `marek.nowak@example.org` the judge role. Assign the submitted project to that judge. Switch to Jury → Reviews, select the event, enter rubric scores, and submit. Show that another judge cannot see this review through the role-scoped API.
4. **2:30–3:25 — Publish.** In Admin → Events, change the submission close time to the past and save the event settings. Inspect the judging progress, individual reviews, and audit log. Publish results. Show the frozen results and download the CSV.
5. **3:25–4:20 — T3 and T4.** Open the seeded `evt_vote_demo` to show randomized community ballots and comments. Return to the published event to show the signed judge record and project certificate. Open a verification link and the embeddable gallery; download the JSON archive. The OpenAPI document is at `/dogfood-api/openapi.json`.
6. **4:20–5:00 — Operability.** Show `python run.py .dogfood.toml` returning 7/7 PASS and mention `python -m unittest discover -s tests -v`. Show the Compose file and explain that SQLite is persisted locally.

The seeded local account password is `dogfood-demo-2026`. Some dashboard panels and arcade scores are browser-local. The script is not itself a recorded video.
