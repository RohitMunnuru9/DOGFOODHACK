# Voting and review abuse model

Organizers can choose ordinary authenticated voting or email-bound invitation-only voting before the first vote. Invitation mode requires possession of a random, single-use, expiring link and an account matching its named email; another self-registered account cannot access the ballot or cast a vote. Organizers distribute links themselves through a trusted channel, so no hosted email service is necessary. This is controlled invitation delivery, not automatic mailbox verification. Policy changes lock after the first vote, and grants survive archive restoration. Duplicate ballots, self-votes, and account rate limits remain enforced. Colluding invitees and careless distribution remain residual risks; authenticated mode alone cannot establish one person per account.

The protected assets are review confidentiality before publication, one community vote per person, the integrity of submitted projects and scores, and the private event archive. The Python API, not the browser role selector, makes authorization decisions. Event participants, judges, organizers, and visitors may all send direct HTTP requests; the browser UI is not a security boundary.

| Abuse | Current control | Residual risk |
| --- | --- | --- |
| Repeated votes from one account | Unique `(event_id,user_id)` vote constraint, transaction around vote creation, event phase and deadline checks | Authenticated mode permits multiple accounts per person; invitation mode relies on trusted distribution, with no automated mailbox verification |
| Self-voting or coordinated teams | Team membership blocks voting for one's own project; ballots are randomized | Friends and alternate accounts can coordinate; randomized order reduces order bias but cannot establish independence |
| Ballot stuffing after close | Server checks phase and `voting_close` on every write; attempts are logged | An organizer can change the window before publication; organizer actions must remain reviewable |
| Spam or duplicate comments | Per-account rate limit, duplicate body check, organizer hide action, audit entries | New accounts and text variations bypass simple controls; moderation is reactive |
| Judge sees another judge's work | Review routes bind access to the authenticated judge ID; organizer preview is separate | A compromised organizer account can see all reviews |
| Judge reviews own team's entry | Assignment creation rejects a judge who is a team member | Undisclosed relationships outside the portal remain possible |
| Score manipulation or late edits | Criterion bounds and complete-score validation; deadlines and published snapshot are enforced server-side | Organizers can change a rubric before publication, so versioned reviews and audit logs must be inspected |
| Public gallery or archive leaks drafts | Public queries include submitted projects only; JSON/CSV export needs organizer role | An organizer archive includes participant emails and must be handled as private data |
| Webhook receiver forgery | HMAC-SHA256 body signature and per-hook secret | A leaked secret permits forgery; the receiver must verify the signature and rotate a compromised endpoint |
| Certificate forgery | HMAC signed record checked by the public verification endpoint | This is server-based verification; a stolen database signing key undermines every record |

Operationally, use a fresh database and private admin password outside demo mode, back up the SQLite volume, limit who can create webhooks, and review the organizer audit screen for unusual vote/comment patterns. Do not claim one-person-one-vote or independent public-key verification until those controls exist.
