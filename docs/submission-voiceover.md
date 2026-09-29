# DOGFOOD 2026 — voiceover for the silent submission video

The video is 4:59, with no audio track. Read each paragraph over its matching scene. Speak naturally at about 125–135 words per minute and leave a short pause at each scene change.

The visual material combines recorded current-UI actions with clearly labeled feature and evidence slides. T3/T4 slides explain implemented behavior; they are not presented as live screen capture.

## 00:00–00:12 · The whole hackathon, in one place

Meet DOGFOOD: a self-hosted portal for the complete hackathon journey. Teams form and submit projects, judges review against a clear rubric, and organizers can manage the event through published results.

## 00:12–00:16 · Current portal in action

This is the actual current interface, running locally.

## 00:16–00:25 · Built to run anywhere

It runs locally with Docker Compose. Next.js serves the interface, Python handles the API and permissions, and SQLite keeps the event data portable.

## 00:25–00:39 · From event setup to submission

First, an organizer creates an event with dates, tracks and prizes. A participant forms a team, writes a draft and submits a project.

## 00:39–00:53 · Event controls that matter

The organizer controls event phases and deadlines from the settings view. The server enforces those deadlines, so a browser cannot simply submit after the cutoff.

## 00:53–01:06 · A real submission flow

Participants can build a team and save their project as a draft. They can return to edit it, then submit when the work is ready.

## 01:06–01:18 · Explore the official fixture

The public gallery loads the official fixture: forty teams and forty-one project rows. Visitors can search and filter submissions; the duplicate remains visible but does not distort results.

## 01:18–01:25 · Each role has a clear workspace

One account can switch workspaces, while the API still checks each event role.

## 01:25–01:37 · Assign, review, publish

Judging begins with assignments. A judge sees their own project, enters rubric scores and feedback, and the organizer can publish a frozen result after the deadline.

## 01:37–01:50 · Thoughtful, private reviews

Judges only see their assigned reviews. Each score follows a weighted rubric, and private comments give teams useful feedback without exposing other judges' work.

## 01:50–02:02 · Progress without peeking

Organizers can monitor assignment progress and export results. A judge cannot read a peer's private score, and a participant cannot access the review ledger.

## 02:02–02:15 · Fairer comparisons

The result calculation documents weighted criteria and judge-mean normalization. Publication freezes the result snapshot so later edits do not quietly change the standings.

## 02:15–02:29 · Find Community Vote Demo

For community voting, choose Participate, select Community Vote Demo in the Current Event dropdown, then open Community in the left navigation. This is the separate voting sample event.

## 02:29–02:43 · Controlled voting access

The organizer chooses signed-in voting or an email-bound invitation. Eligible projects appear in a shuffled ballot, and each account can cast only one recorded vote.

## 02:43–02:57 · A conversation around projects

The same community area supports project comments. Organizers can moderate them, while duplicate and rate controls help keep the discussion useful.

## 02:57–03:10 · Results stay private until release

During voting, public tallies stay hidden. The organizer can inspect the audit trail for blocked attempts; visitors only see results after publication.

## 03:10–03:24 · Documented API and webhooks

For integrations, the portal exposes a documented REST API and signed event webhooks. Organizers can inspect deliveries and retry pending ones.

## 03:24–03:38 · Records people can verify

After publication, the portal can issue project certificates and judge participation records. Each record has a public verification link served by the issuing portal.

## 03:38–03:51 · Put the gallery anywhere

The public gallery can also be embedded in another site with an iframe, so an event can display its projects outside the organizer workspace.

## 03:51–04:05 · Your event data can move

A full JSON archive can restore event history into a new empty event, including roles, rubric versions, reviews, votes and comments. Passwords and signing secrets stay out of the archive.

## 04:05–04:23 · The checks are visible in the repo

The published DOGFOOD checker passes all seven of its T1 and T2 probes. Separate project regression tests pass two T3 and four T4 workflows. Those higher-tier tests are clearly labeled as our own, not organizer verification.

## 04:23–04:38 · Clone. Start. Explore.

The public repository includes the source, fixtures, architecture notes and test reports. A judge can start it with Docker Compose, and SQLite data survives a service restart.

## 04:38–04:44 · A little room to play

There is also an arcade for a small break between the serious work.

## 04:44–04:59 · DOGFOOD 2026

DOGFOOD keeps the event journey together: build, review, vote and celebrate. The code and test evidence are in the public repository. Thank you for watching.

## Recording notes

- Do not show passwords, session tokens, or webhook secrets.
- Export your voiceover as WAV or MP3. It can be added as a separate audio track later.
- The published checker confirms T1/T2 only; the T3/T4 test scores shown are project-owned regressions.
