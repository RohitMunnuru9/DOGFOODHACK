# DOGFOOD 2026 — five-minute screen-recording voiceover

The video runs **4:59** and has no audio track. Read each paragraph over the matching time range at a conversational pace. Let the recorded clicks and transitions breathe. These are real portal recordings throughout: the opening and Community sections show the current interface, while the longer detailed lifecycle footage uses the earlier interface.

## 00:00–00:18 · The current DOGFOOD interface

This is DOGFOOD, a portal for running a hackathon from the first team to the final result. We start with a quick recording of the current interface: organizers create an event, and participants build teams and submit their projects.

## 00:18–00:36 · From reviews to celebration

Judges receive assignments and score projects against a rubric. Organizers publish the results, visitors explore the public gallery, and the Arcade offers a short break. Now let us slow down and follow the full workflow step by step.

## 00:36–01:03 · Set the stage

The organizer enters the event name, schedule, tracks, and prizes. They can invite participants and judges, choose a judge’s tracks, and add questions for project teams. The event phase and deadlines are enforced by the server, so changing a browser field cannot quietly reopen a closed submission period.

## 01:03–01:30 · Build a team and draft a project

In the participant workspace, someone creates a team, enters a project title and summary, and adds the fuller story and links. A draft can be saved and edited while submissions are open. The team can review its work before submitting, instead of losing everything in one form session.

## 01:30–01:54 · Submit and discover

When the project is ready, the participant submits it. The public gallery makes submitted work discoverable by name and track, and each project has a dedicated page. The portal keeps the submission state, deadline, and team membership on the server so visitors see the same event data.

## 01:54–02:18 · Assign fair review work

Back in the organizer workspace, judges receive access to the appropriate event and tracks. An organizer can assign a balanced batch or assign a particular submitted project. The progress panel shows how many reviews are pending and completed, without revealing another judge’s private work to a participant.

## 02:18–02:45 · Judge an assigned project

Here is the judge’s view. The judge opens only a project assigned to them, reads the complete submission, gives scores for functionality, quality, and innovation, and writes useful feedback. The rubric weights determine the raw score. The review is saved under that judge’s identity and rubric version; another judge cannot request those private scores.

## 02:45–03:07 · Complete reviews and inspect progress

The judge saves the weighted review, and the organizer sees the completion count update. The progress view identifies what is still pending. Scores remain private until the event is ready to publish, but the organizer can inspect the calculated result and prepare the final snapshot.

## 03:07–03:27 · Publish a frozen result

After submissions close, the organizer publishes the judging result. This freezes a snapshot of the standings, so later timing changes or score edits cannot silently rewrite it. The organizer can export a CSV with the scores and review counts for the event record.

## 03:27–03:42 · Cast a community vote

This is the current interface. In Community Vote Demo, the participant sees a shuffled ballot. Their own team is ineligible. They vote for Open Orbit, and the portal records it. The Results screen still hides totals from visitors.

## 03:42–03:57 · Discuss a submitted project

Next, the participant opens Open Orbit’s discussion and posts a comment. The saved message appears with their name on the project, giving teams a place to receive feedback beyond the judging rubric.

## 03:57–04:12 · Moderate and preview

The organizer sees that comment and hides it from public view. They can also inspect voting access and preview the result while visitors still see no totals. Moderation and release remain under event control.

## 04:12–04:22 · Return to publication

Back in the full event recording, the organizer finishes publication and exports the scoring record. The published snapshot is fixed.

## 04:22–04:37 · Verify participation records

Publication also issues a project certificate and a judge record. Each opens a public verification page served by this portal. The video opens one, showing how a recipient can check it against the event’s published result.

## 04:37–04:49 · Move data and integrate

The organizer can export a full event archive, embed the public gallery, use the REST API, and configure signed webhooks. Passwords and signing secrets stay out of the archive.

## 04:49–04:59 · Public result and close

Finally, a visitor sees the frozen result in the public gallery without signing in. The source and test reports are in the repository. Thanks for watching.

## Recording notes

- Record voice only; this MP4 intentionally has no audio track. Send the WAV or MP3 file to add it to the video.
- The opening and Community sections show the current interface. The detailed middle and closing sections come from the earlier recorded interface. All sections show the real portal, not mockup slides.
- The published checker verifies T1/T2. T3/T4 have separate project-owned regression evidence in the repository.
- Do not show passwords, session tokens, invitation links, or webhook secrets in any added footage.
