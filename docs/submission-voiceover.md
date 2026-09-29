# DOGFOOD 2026 — narrated submission video

This is the pitch text supplied for the ElevenLabs Viraj English narration in [submission-demo-voiced.mp4](submission-demo-voiced.mp4). The generated MP3 ran 5:21.8; its tempo was increased by 7.8% to fit the 4:59 screen recording. The opening and Community sections show the current interface; the detailed lifecycle and closing sections use the earlier recorded interface. All footage shows the real portal.

## Narration

A hackathon brings together people with ambitious ideas. But running one often means juggling registration forms, team lists, submission links, judging spreadsheets, voting tools, and result announcements. Every handoff creates another chance for confusion.

DOGFOOD brings that journey into one portal. Organizers can set up an event, participants can build and submit, judges can review fairly, and the community can discover what everyone made. The goal is simple: give every person a clear next step, while keeping the event’s rules and records in one place.

Let me show you how it works.

An organizer starts by creating an event. They set the schedule, tracks, prizes, and questions teams need to answer. They can invite participants and judges, and decide which tracks each judge will review. This is more than a page of editable dates. The server enforces event phases and deadlines, so a browser change cannot reopen a closed submission period.

Now we move into the participant workspace. A participant creates a team and begins a project submission. They can add a title, summary, detailed description, and links to their work. The project starts as a draft. That matters because a team rarely has every detail ready in one sitting. They can return, improve the submission, and review it before the deadline.

When they submit, the project becomes part of the event’s shared record. The public gallery helps people find work by project and track, and each submission has its own page. Participants can see what they submitted; organizers can see the event’s progress. They are working from the same server-side data, rather than separate copies of a spreadsheet.

Next comes one of the hardest parts of any hackathon: judging. Organizers can give judges access to the right event and tracks, then assign projects individually or in balanced batches. The progress view shows what has been completed and what still needs attention. That makes it easier to follow up before the final deadline without exposing private reviews to participants.

Here is the judge’s workspace. A judge opens an assigned project, reads the full submission, and scores it against a weighted rubric for functionality, quality, and innovation. They can also leave written feedback that tells a team more than a number ever could. Reviews are tied to the judge and the rubric version. A judge cannot simply open another judge’s private scores.

As reviews come in, the organizer can monitor completion and inspect the calculated results. The scoring method is documented in the repository, including how scores from different judges are normalized. That detail matters: a result should be explainable, especially when several judges have different scoring habits.

When judging is complete, the organizer publishes the result. Publication creates a frozen snapshot of the standings. A later edit to a score or deadline cannot silently change what was announced. The organizer can also export the scores and review counts as a C S V for the event record.

DOGFOOD also gives the community a role. In this voting demo, the participant sees a shuffled ballot. They cannot vote for their own team. They choose Open Orbit, and their vote is recorded, while public totals remain hidden during voting. The project page also supports discussion. The participant posts a comment, and the organizer can moderate it by hiding it from public view. Voting access, visibility, and moderation stay under event control.

After publication, the portal can issue a project certificate and a judge participation record. Each has a verification page on the issuing portal, so a recipient can share a record that someone else can check. Organizers can export an event archive, embed the public gallery, use the documented A P I, and configure signed webhooks for integrations. Passwords and signing secrets are excluded from exported archives.

Finally, visitors can explore the published results without signing in. The repository includes the source code, setup instructions, and test evidence. The published checker passes all seven available core and judging checks; the voting and integration workflows have separate project tests.

DOGFOOD is designed to carry an event all the way from the first team to a result people can inspect. It gives organizers control, gives participants clarity, gives judges a focused workflow, and gives the community a place to see the work. Thank you for watching.
