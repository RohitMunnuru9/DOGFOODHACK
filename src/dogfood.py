"""DOGFOOD local hackathon portal. Python standard library only."""

from __future__ import annotations

import csv
import hashlib
import hmac
import html
import io
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("DOGFOOD_DB", ROOT / "data" / "dogfood.sqlite3"))
FIXTURE_PATH = Path(os.environ.get("DOGFOOD_FIXTURES", ROOT / "fixtures.json"))
DEMO_MODE = os.environ.get("DOGFOOD_DEMO_MODE", "1") == "1"
PORT = int(os.environ.get("PORT", "8080"))
HOST = os.environ.get("HOST", "0.0.0.0")
UTC = timezone.utc
DEMO_PASSWORD = "dogfood-demo-2026"
DEMO_TOKENS = {
    "organizer": ("organizer@demo.local", "dogfood-organizer-2026"),
    "judge_a": ("marek.nowak@example.org", "dogfood-judge-a-2026"),
    "judge_b": ("priya.nair@example.org", "dogfood-judge-b-2026"),
    "participant": ("participant@demo.local", "dogfood-participant-2026"),
}


def now() -> datetime:
    return datetime.now(UTC)


def iso(value: datetime | None = None) -> str:
    return (value or now()).astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(parsed.tzinfo is not None, 422, "Dates must include a UTC offset")
    return parsed.astimezone(UTC)


def uid(prefix: str) -> str:
    return prefix + "_" + secrets.token_hex(8)


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 250_000)
    return salt + ":" + digest.hex()


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, expected = stored.split(":", 1)
        return hmac.compare_digest(password_hash(password, salt), stored)
    except (ValueError, TypeError):
        return False


@contextmanager
def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=15000")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 starts_at TEXT NOT NULL, submissions_close TEXT NOT NULL,
 judging_close TEXT, voting_close TEXT, status TEXT NOT NULL DEFAULT 'draft',
 published_at TEXT, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS event_roles (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('participant','judge','organizer')),
 PRIMARY KEY(event_id,user_id,role)
);
CREATE TABLE IF NOT EXISTS tracks (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 name TEXT NOT NULL, UNIQUE(event_id,name)
);
CREATE TABLE IF NOT EXISTS judge_track_scopes (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 track_ids TEXT NOT NULL, PRIMARY KEY(event_id,user_id)
);
CREATE TABLE IF NOT EXISTS role_invite_scopes (
 token_hash TEXT PRIMARY KEY REFERENCES role_invites(token_hash) ON DELETE CASCADE,
 track_ids TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prizes (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS teams (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 name TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS team_members (
 team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 joined_at TEXT NOT NULL, PRIMARY KEY(team_id,user_id)
);
CREATE TABLE IF NOT EXISTS team_invites (
 token_hash TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL, max_uses INTEGER NOT NULL, uses INTEGER NOT NULL DEFAULT 0,
 revoked INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS role_invites (
 token_hash TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('participant','judge','organizer')),
 expires_at TEXT NOT NULL, accepted_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 team_id TEXT NOT NULL REFERENCES teams(id), track_id TEXT REFERENCES tracks(id),
 title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', repo_url TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('draft','submitted')),
 submitted_at TEXT, source_fixture_id TEXT UNIQUE, duplicate_of TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_live_project_per_team
 ON projects(team_id) WHERE source_fixture_id IS NULL;
CREATE TABLE IF NOT EXISTS project_details (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 tagline TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
 thumbnail_url TEXT NOT NULL DEFAULT '', demo_url TEXT NOT NULL DEFAULT '',
 live_url TEXT NOT NULL DEFAULT '', image_urls TEXT NOT NULL DEFAULT '[]',
 tech_tags TEXT NOT NULL DEFAULT '[]', custom_answers TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS event_questions (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 code TEXT NOT NULL, label TEXT NOT NULL, required INTEGER NOT NULL DEFAULT 0,
 position INTEGER NOT NULL, PRIMARY KEY(event_id,code)
);
CREATE TABLE IF NOT EXISTS archive_provenance (
 event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
 source_event_json TEXT NOT NULL, original_records_json TEXT NOT NULL,
 imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS archive_accounts (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(event_id,user_id)
);
CREATE TABLE IF NOT EXISTS rubrics (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 version INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
 UNIQUE(event_id,version)
);
CREATE TABLE IF NOT EXISTS criteria (
 id TEXT PRIMARY KEY, rubric_id TEXT NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
 code TEXT NOT NULL, label TEXT NOT NULL, weight REAL NOT NULL CHECK(weight>0),
 min_score REAL NOT NULL, max_score REAL NOT NULL, position INTEGER NOT NULL,
 UNIQUE(rubric_id,code)
);
CREATE TABLE IF NOT EXISTS assignments (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 judge_user_id TEXT NOT NULL REFERENCES users(id), batch TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, UNIQUE(project_id,judge_user_id)
);
CREATE TABLE IF NOT EXISTS reviews (
 id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL UNIQUE REFERENCES assignments(id) ON DELETE CASCADE,
 rubric_id TEXT NOT NULL REFERENCES rubrics(id), status TEXT NOT NULL CHECK(status IN ('draft','submitted')),
 comment TEXT NOT NULL DEFAULT '', submitted_at TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS criterion_scores (
 review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
 criterion_id TEXT NOT NULL REFERENCES criteria(id), value REAL NOT NULL,
 PRIMARY KEY(review_id,criterion_id)
);
CREATE TABLE IF NOT EXISTS result_snapshots (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 raw_score REAL, adjusted_score REAL, review_count INTEGER NOT NULL,
 method TEXT NOT NULL, published_at TEXT NOT NULL, PRIMARY KEY(event_id,project_id)
);
CREATE TABLE IF NOT EXISTS votes (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id), user_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, UNIQUE(event_id,user_id)
);
CREATE TABLE IF NOT EXISTS voting_policies (
 event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
 mode TEXT NOT NULL CHECK(mode IN ('authenticated','invitation'))
);
CREATE TABLE IF NOT EXISTS voter_invites (
 token_hash TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 email TEXT NOT NULL, expires_at TEXT NOT NULL, accepted_at TEXT
);
CREATE TABLE IF NOT EXISTS voter_access (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), granted_at TEXT NOT NULL,
 PRIMARY KEY(event_id,user_id)
);
CREATE TABLE IF NOT EXISTS comments (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'visible', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor_id TEXT,
 action TEXT NOT NULL, event_id TEXT, target_id TEXT, detail TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS signing_keys (
 id INTEGER PRIMARY KEY CHECK(id=1), secret TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS issued_records (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('judge','project')),
 subject_id TEXT NOT NULL, payload_json TEXT NOT NULL, signature TEXT NOT NULL,
 issued_at TEXT NOT NULL, UNIQUE(event_id,kind,subject_id)
);
CREATE TABLE IF NOT EXISTS webhooks (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 url TEXT NOT NULL, secret TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
 id TEXT PRIMARY KEY, webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 action TEXT NOT NULL, payload_json TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 delivered_at TEXT, last_error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_by_event ON audit_events(event_id,at);
CREATE INDEX IF NOT EXISTS projects_by_event ON projects(event_id,status,track_id);
CREATE INDEX IF NOT EXISTS assignments_by_judge ON assignments(judge_user_id,event_id);
"""


def audit(conn: sqlite3.Connection, action: str, actor: str | None = None,
          event: str | None = None, target: str | None = None, detail: str = "") -> None:
    at = iso()
    cursor = conn.execute("INSERT INTO audit_events(at,actor_id,action,event_id,target_id,detail) VALUES(?,?,?,?,?,?)",
                          (at, actor, action, event, target, detail[:500]))
    if event:
        payload = json.dumps({"id": cursor.lastrowid, "event_id": event, "action": action,
                              "at": at, "actor_id": actor, "target_id": target,
                              "detail": detail[:500]}, sort_keys=True, separators=(",", ":"))
        for hook in conn.execute("SELECT id FROM webhooks WHERE event_id=? AND active=1", (event,)):
            conn.execute("""INSERT INTO webhook_deliveries
                (id,webhook_id,event_id,action,payload_json,created_at) VALUES(?,?,?,?,?,?)""",
                (uid("whd"), hook["id"], event, action, payload, at))


def role(conn: sqlite3.Connection, user: sqlite3.Row | None, event_id: str, wanted: str) -> bool:
    if user is None:
        return False
    if user["is_admin"]:
        return True
    return conn.execute("SELECT 1 FROM event_roles WHERE event_id=? AND user_id=? AND role=?",
                        (event_id, user["id"], wanted)).fetchone() is not None


def can_manage(conn: sqlite3.Connection, user: sqlite3.Row | None, event_id: str) -> bool:
    return role(conn, user, event_id, "organizer")


def validate_track_scope(conn, event_id, tracks):
    if tracks is None:
        return None  # Explicit event-wide judge.
    require(isinstance(tracks, list) and all(isinstance(t, str) for t in tracks),
            422, "track_ids must be an array or null for all tracks")
    available = {r[0] for r in conn.execute("SELECT id FROM tracks WHERE event_id=?", (event_id,))}
    require(set(tracks) <= available, 422, "Judge tracks must belong to this event")
    return sorted(set(tracks))


def judge_track_scope(conn, event_id, judge_id):
    row = conn.execute("SELECT track_ids FROM judge_track_scopes WHERE event_id=? AND user_id=?",
                       (event_id, judge_id)).fetchone()
    return json.loads(row[0]) if row else None


def judge_can_review(conn, judge_id, event_id, track_id):
    user = conn.execute("SELECT * FROM users WHERE id=?", (judge_id,)).fetchone()
    if not role(conn, user, event_id, "judge"):
        return False
    scope = judge_track_scope(conn, event_id, judge_id)
    return scope is None or track_id in scope


def voting_policy(conn, event_id):
    row = conn.execute("SELECT mode FROM voting_policies WHERE event_id=?", (event_id,)).fetchone()
    return row[0] if row else "authenticated"


def require_voter_access(conn, event_id, user):
    if voting_policy(conn, event_id) == "invitation" and not conn.execute(
            "SELECT 1 FROM voter_access WHERE event_id=? AND user_id=?", (event_id, user["id"])).fetchone():
        audit(conn, "uninvited_vote_blocked", user["id"], event_id)
        conn.commit()
        raise ApiError(403, "This ballot requires an email-bound voter invitation from the organizer")


def is_team_member(conn: sqlite3.Connection, user: sqlite3.Row | None, team_id: str) -> bool:
    return bool(user and conn.execute("SELECT 1 FROM team_members WHERE team_id=? AND user_id=?",
                                      (team_id, user["id"])).fetchone())


def user_by_email(conn: sqlite3.Connection, email: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM users WHERE email=?", (email.strip().lower(),)).fetchone()


def create_user(conn: sqlite3.Connection, email: str, name: str, password: str,
                user_id: str | None = None, admin: bool = False) -> str:
    email = email.strip().lower()
    existing = user_by_email(conn, email)
    if existing:
        return existing["id"]
    user_id = user_id or uid("usr")
    conn.execute("INSERT INTO users(id,email,name,password_hash,is_admin,created_at) VALUES(?,?,?,?,?,?)",
                 (user_id, email, name.strip(), password_hash(password), int(admin), iso()))
    return user_id


def create_session(conn: sqlite3.Connection, user_id: str, token: str | None = None,
                   demo: bool = False) -> str:
    token = token or secrets.token_urlsafe(36)
    expiry = now() + (timedelta(days=30) if demo else timedelta(days=7))
    conn.execute("INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at,is_demo) VALUES(?,?,?,?)",
                 (token_hash(token), user_id, iso(expiry), int(demo)))
    return token


def seed() -> None:
    with db() as conn:
        conn.executescript(SCHEMA)
        conn.execute("INSERT OR IGNORE INTO signing_keys(id,secret) VALUES(1,?)", (secrets.token_hex(32),))
        admin_email = os.environ.get("DOGFOOD_ADMIN_EMAIL", "").strip().lower()
        admin_password = os.environ.get("DOGFOOD_ADMIN_PASSWORD", "")
        if admin_email or admin_password:
            require(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", admin_email) is not None and
                    len(admin_password) >= 12, 422,
                    "Set a valid DOGFOOD_ADMIN_EMAIL and a DOGFOOD_ADMIN_PASSWORD of at least 12 characters")
            create_user(conn, admin_email, "Portal Admin", admin_password, admin=True)
        if not DEMO_MODE or not FIXTURE_PATH.exists():
            return
        fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        organizer = create_user(conn, "organizer@demo.local", "Demo Organizer", DEMO_PASSWORD, "demo_organizer")
        create_user(conn, "admin@demo.local", "Demo Admin", DEMO_PASSWORD, "demo_admin", admin=True)
        participant = create_user(conn, "participant@demo.local", "Demo Participant", DEMO_PASSWORD, "demo_participant")
        event = fixture["event"]
        conn.execute("INSERT OR IGNORE INTO events(id,name,description,starts_at,submissions_close,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)",
                     (event["id"], event["name"], "Imported DOGFOOD fixture", "2026-02-26T00:00:00Z",
                      event["submissions_close"], "judging", organizer, iso()))
        open_close = iso(now() + timedelta(days=7))
        conn.execute("INSERT OR IGNORE INTO events(id,name,description,starts_at,submissions_close,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)",
                     ("evt_demo", "DOGFOOD Live Demo", "Open event for the full create to publish walkthrough",
                      iso(now() - timedelta(days=1)), open_close, "open", organizer, iso()))
        conn.execute("""INSERT OR IGNORE INTO events
            (id,name,description,starts_at,submissions_close,voting_close,status,created_by,created_at)
            VALUES(?,?,?,?,?,?,?,?,?)""",
            ("evt_vote_demo", "Community Vote Demo", "Explore randomized ballots and project discussion",
             iso(now() - timedelta(days=2)), iso(now() - timedelta(days=1)),
             iso(now() + timedelta(days=30)), "voting", organizer, iso()))
        for event_id in (event["id"], "evt_demo"):
            conn.execute("INSERT OR IGNORE INTO event_roles VALUES(?,?,?)", (event_id, organizer, "organizer"))
            conn.execute("INSERT OR IGNORE INTO event_roles VALUES(?,?,?)", (event_id, participant, "participant"))
        vote_builder = create_user(conn, "vote-builder@demo.local", "Demo Builder", DEMO_PASSWORD,
                                   "demo_vote_builder")
        for account, assigned in ((organizer, "organizer"), (participant, "participant"),
                                  (vote_builder, "participant")):
            conn.execute("INSERT OR IGNORE INTO event_roles VALUES(?,?,?)",
                         ("evt_vote_demo", account, assigned))
        conn.execute("INSERT OR IGNORE INTO tracks VALUES(?,?,?)",
                     ("vote_demo_track", "evt_vote_demo", "Open Innovation"))
        for team_id, project_id, account, name, title, summary in (
            ("vote_demo_team_a", "vote_demo_project_a", participant, "Signal Garden",
             "Signal Garden", "An accessible map for community projects and local resources."),
            ("vote_demo_team_b", "vote_demo_project_b", vote_builder, "Open Orbit",
             "Open Orbit", "A lightweight workspace for teams to share their progress."),
        ):
            conn.execute("INSERT OR IGNORE INTO teams VALUES(?,?,?,?,?)",
                         (team_id, "evt_vote_demo", name, account, iso()))
            conn.execute("INSERT OR IGNORE INTO team_members VALUES(?,?,?)", (team_id, account, iso()))
            conn.execute("""INSERT OR IGNORE INTO projects
                (id,event_id,team_id,track_id,title,summary,repo_url,status,submitted_at,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (project_id, "evt_vote_demo", team_id, "vote_demo_track", title, summary, "",
                 "submitted", iso(now() - timedelta(days=1)), iso(), iso()))
        for item in fixture["tracks"]:
            conn.execute("INSERT OR IGNORE INTO tracks(id,event_id,name) VALUES(?,?,?)",
                         (item["id"], event["id"], item["name"]))
            conn.execute("INSERT OR IGNORE INTO tracks(id,event_id,name) VALUES(?,?,?)",
                         ("demo_" + item["id"], "evt_demo", item["name"]))
        judge_ids: dict[str, str] = {}
        for item in fixture["judges"]:
            jid = create_user(conn, item["email"], item["name"], DEMO_PASSWORD, "judge_" + item["id"])
            judge_ids[item["id"]] = jid
            conn.execute("INSERT OR IGNORE INTO event_roles VALUES(?,?,?)", (event["id"], jid, "judge"))
            conn.execute("INSERT OR IGNORE INTO judge_track_scopes VALUES(?,?,?)",
                         (event["id"], jid, json.dumps(item["tracks"])))
        # Keep the historical fixture closed for the checker, but provide a
        # separate pending review that can actually be submitted in the UI.
        review_event = "evt_review_demo"
        review_judge = user_by_email(conn, "marek.nowak@example.org")["id"]
        conn.execute("""INSERT OR IGNORE INTO events
            (id,name,description,starts_at,submissions_close,judging_close,status,created_by,created_at)
            VALUES(?,?,?,?,?,?,?,?,?)""",
            (review_event, "Live Judging Demo", "A submitted project with an open judge assignment",
             iso(now() - timedelta(days=2)), iso(now() - timedelta(days=1)),
             iso(now() + timedelta(days=30)), "judging", organizer, iso()))
        for account, assigned in ((organizer, "organizer"), (participant, "participant"),
                                  (review_judge, "judge")):
            conn.execute("INSERT OR IGNORE INTO event_roles VALUES(?,?,?)",
                         (review_event, account, assigned))
        conn.execute("INSERT OR IGNORE INTO tracks VALUES(?,?,?)",
                     ("review_demo_track", review_event, "Open Innovation"))
        conn.execute("INSERT OR IGNORE INTO teams VALUES(?,?,?,?,?)",
                     ("review_demo_team", review_event, "North Star", participant, iso()))
        conn.execute("INSERT OR IGNORE INTO team_members VALUES(?,?,?)",
                     ("review_demo_team", participant, iso()))
        conn.execute("""INSERT OR IGNORE INTO projects
            (id,event_id,team_id,track_id,title,summary,repo_url,status,submitted_at,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            ("review_demo_project", review_event, "review_demo_team", "review_demo_track",
             "North Star", "A shared workspace for teams to turn ideas into working projects.", "",
             "submitted", iso(now() - timedelta(days=1)), iso(), iso()))
        review_rubric = "rubric_" + review_event + "_1"
        conn.execute("INSERT OR IGNORE INTO rubrics VALUES(?,?,?,?,?)",
                     (review_rubric, review_event, 1, 1, iso()))
        for pos, name in enumerate(("functionality", "quality", "innovation")):
            conn.execute("INSERT OR IGNORE INTO criteria VALUES(?,?,?,?,?,?,?,?)",
                         (review_rubric + "_" + name, review_rubric, name, name.title(), 1, 1, 5, pos))
        conn.execute("INSERT OR IGNORE INTO assignments VALUES(?,?,?,?,?,?)",
                     ("review_demo_assignment", review_event, "review_demo_project", review_judge,
                      "demo-pending", iso()))
        for item in fixture["teams"]:
            members = item.get("members", [])
            leader = create_user(conn, members[0], members[0].split("@")[0], DEMO_PASSWORD) if members else participant
            conn.execute("INSERT OR IGNORE INTO event_roles VALUES(?,?,?)", (event["id"], leader, "participant"))
            conn.execute("INSERT OR IGNORE INTO teams(id,event_id,name,created_by,created_at) VALUES(?,?,?,?,?)",
                         (item["id"], event["id"], item["name"], leader, iso()))
            for email in members:
                member = create_user(conn, email, email.split("@")[0], DEMO_PASSWORD)
                conn.execute("INSERT OR IGNORE INTO event_roles VALUES(?,?,?)", (event["id"], member, "participant"))
                conn.execute("INSERT OR IGNORE INTO team_members VALUES(?,?,?)", (item["id"], member, iso()))
        seen: dict[tuple[str, str, str], str] = {}
        for item in fixture["projects"]:
            fingerprint = (item["team"], item["title"].casefold(), item.get("repo_url", ""))
            duplicate_of = seen.get(fingerprint)
            seen.setdefault(fingerprint, item["id"])
            conn.execute("""INSERT OR IGNORE INTO projects
                (id,event_id,team_id,track_id,title,summary,repo_url,status,submitted_at,
                 source_fixture_id,duplicate_of,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (item["id"], event["id"], item["team"], item["track"], item["title"],
                 item.get("summary", ""), item.get("repo_url", ""), "submitted",
                 item["submitted_at"], item["id"], duplicate_of, item["submitted_at"], item["submitted_at"]))
        for event_id in (event["id"], "evt_demo", "evt_vote_demo"):
            rid = "rubric_" + event_id + "_1"
            conn.execute("INSERT OR IGNORE INTO rubrics VALUES(?,?,?,?,?)", (rid, event_id, 1, 1, iso()))
            for pos, name in enumerate(("functionality", "quality", "innovation")):
                conn.execute("INSERT OR IGNORE INTO criteria VALUES(?,?,?,?,?,?,?,?)",
                             (rid + "_" + name, rid, name, name.title(), 1, 1, 5, pos))
        for index, item in enumerate(fixture["scores"]):
            judge = judge_ids[item["judge"]]
            aid = "fixture_assignment_" + str(index + 1)
            rid = "fixture_review_" + str(index + 1)
            rubric = "rubric_" + event["id"] + "_1"
            conn.execute("INSERT OR IGNORE INTO assignments VALUES(?,?,?,?,?,?)",
                         (aid, event["id"], item["project"], judge, "fixture-completed", iso()))
            # A fixture may repeat a judge/project pair. Keep the first completed review.
            actual = conn.execute("SELECT id FROM assignments WHERE project_id=? AND judge_user_id=?",
                                  (item["project"], judge)).fetchone()["id"]
            rid = "fixture_review_" + actual
            conn.execute("INSERT OR IGNORE INTO reviews VALUES(?,?,?,?,?,?,?)",
                         (rid, actual, rubric, "submitted", item.get("comment", ""), iso(), iso()))
            for name, value in item["criteria"].items():
                conn.execute("INSERT OR IGNORE INTO criterion_scores VALUES(?,?,?)",
                             (rid, rubric + "_" + name, value))
        # Pending assignments are explicit records, separate from completed reviews.
        for project in fixture["projects"]:
            count = conn.execute("SELECT COUNT(*) FROM assignments WHERE project_id=?", (project["id"],)).fetchone()[0]
            if count >= 3:
                continue
            eligible = [j for j in fixture["judges"] if project["track"] in j["tracks"]]
            for item in eligible:
                if count >= 3:
                    break
                judge = judge_ids[item["id"]]
                conflict = conn.execute("""SELECT 1 FROM team_members tm JOIN projects p ON p.team_id=tm.team_id
                    WHERE p.id=? AND tm.user_id=?""", (project["id"], judge)).fetchone()
                existing = conn.execute("SELECT 1 FROM assignments WHERE project_id=? AND judge_user_id=?",
                                        (project["id"], judge)).fetchone()
                if conflict or existing:
                    continue
                conn.execute("INSERT OR IGNORE INTO assignments VALUES(?,?,?,?,?,?)",
                             ("pending_" + project["id"] + "_" + item["id"], event["id"], project["id"],
                              judge, "fixture-gap", iso()))
                count += 1
        for _, (email, token) in DEMO_TOKENS.items():
            account = user_by_email(conn, email)
            if account:
                create_session(conn, account["id"], token, demo=True)
        if not conn.execute("SELECT 1 FROM audit_events WHERE action='fixture_import'").fetchone():
            audit(conn, "fixture_import", organizer, event["id"], detail="Official fixture imported with duplicate retained")


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def require(condition: bool, status: int, message: str) -> None:
    if not condition:
        raise ApiError(status, message)


def clean(value: object, limit: int = 300) -> str:
    require(isinstance(value, str), 422, "Expected text")
    result = value.strip()
    require(len(result) <= limit, 422, "Text is too long")
    return result


def repo_url(value: object) -> str:
    result = clean(value, 500)
    parsed = urlsplit(result)
    require(not result or (parsed.scheme in ("http", "https") and parsed.netloc), 422,
            "Repository URL must use HTTP or HTTPS")
    return result


def project_payload(conn: sqlite3.Connection, project: sqlite3.Row) -> dict:
    result = dict(project)
    details = conn.execute("SELECT * FROM project_details WHERE project_id=?", (project["id"],)).fetchone()
    result.update({"tagline": "", "description": "", "thumbnail_url": "", "demo_url": "",
                   "live_url": "", "image_urls": [], "tech_tags": [], "custom_answers": {}})
    if details:
        result.update({key: details[key] for key in
                       ("tagline", "description", "thumbnail_url", "demo_url", "live_url")})
        result.update({key: json.loads(details[key]) for key in
                       ("image_urls", "tech_tags", "custom_answers")})
    return result


def save_project_details(conn: sqlite3.Connection, project_id: str, body: dict) -> None:
    keys = {"tagline", "description", "thumbnail_url", "demo_url", "live_url",
            "image_urls", "tech_tags", "custom_answers"}
    if not keys.intersection(body):
        return
    current = conn.execute("SELECT * FROM project_details WHERE project_id=?", (project_id,)).fetchone()
    data = {"tagline": current["tagline"] if current else "",
            "description": current["description"] if current else "",
            "thumbnail_url": current["thumbnail_url"] if current else "",
            "demo_url": current["demo_url"] if current else "",
            "live_url": current["live_url"] if current else "",
            "image_urls": current["image_urls"] if current else "[]",
            "tech_tags": current["tech_tags"] if current else "[]",
            "custom_answers": current["custom_answers"] if current else "{}"}
    for key, limit in (("tagline", 160), ("description", 8000)):
        if key in body:
            data[key] = clean(body[key], limit)
    for key in ("thumbnail_url", "demo_url", "live_url"):
        if key in body:
            data[key] = repo_url(body[key])
    if "image_urls" in body:
        images = body["image_urls"]
        require(isinstance(images, list) and len(images) <= 8, 422, "Up to eight image URLs allowed")
        data["image_urls"] = json.dumps([repo_url(item) for item in images])
    if "tech_tags" in body:
        tags = body["tech_tags"]
        require(isinstance(tags, list) and len(tags) <= 20, 422, "Up to twenty tech tags allowed")
        data["tech_tags"] = json.dumps([clean(item, 40) for item in tags])
    if "custom_answers" in body:
        answers = body["custom_answers"]
        require(isinstance(answers, dict) and len(answers) <= 20, 422, "Up to twenty answers allowed")
        event_id = conn.execute("SELECT event_id FROM projects WHERE id=?", (project_id,)).fetchone()[0]
        codes = {r[0] for r in conn.execute("SELECT code FROM event_questions WHERE event_id=?", (event_id,))}
        require(set(answers) <= codes and all(isinstance(value, str) and len(value) <= 2000 for value in answers.values()),
                422, "Answers must match event questions and contain at most 2000 characters")
        data["custom_answers"] = json.dumps({clean(key, 80): clean(value, 2000)
                                              for key, value in answers.items()})
    conn.execute("""INSERT INTO project_details
        (project_id,tagline,description,thumbnail_url,demo_url,live_url,image_urls,tech_tags,custom_answers)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET
        tagline=excluded.tagline,description=excluded.description,thumbnail_url=excluded.thumbnail_url,
        demo_url=excluded.demo_url,live_url=excluded.live_url,image_urls=excluded.image_urls,
        tech_tags=excluded.tech_tags,custom_answers=excluded.custom_answers""",
        (project_id, *data.values()))


def rowdict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row else None


def validate_project_answers(conn, project_id):
    project = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    answers = project_payload(conn, project)["custom_answers"]
    missing = [r["label"] for r in conn.execute("SELECT * FROM event_questions WHERE event_id=? AND required=1",
               (project["event_id"],)) if not answers.get(r["code"], "").strip()]
    require(not missing, 422, "Required answers missing: " + ", ".join(missing))


def csv_safe(value: object) -> str:
    result = "" if value is None else str(value)
    return "'" + result if result.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else result


def event_row(conn: sqlite3.Connection, event_id: str) -> sqlite3.Row:
    event = conn.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
    require(event is not None, 404, "Event not found")
    return event


def submission_open(event: sqlite3.Row) -> bool:
    return (event["status"] == "open" and parse_time(event["starts_at"]) <= now() <
            parse_time(event["submissions_close"]))


def require_submission_open(event: sqlite3.Row) -> None:
    require(now() < parse_time(event["submissions_close"]), 409, "Submission deadline has passed")
    require(submission_open(event), 409, "Submissions are not open")


def active_rubric(conn: sqlite3.Connection, event_id: str) -> sqlite3.Row:
    rubric = conn.execute("SELECT * FROM rubrics WHERE event_id=? AND active=1 ORDER BY version DESC LIMIT 1",
                          (event_id,)).fetchone()
    require(rubric is not None, 409, "No active rubric")
    return rubric


def rubric_criteria(conn: sqlite3.Connection, rubric_id: str) -> list[sqlite3.Row]:
    return conn.execute("SELECT * FROM criteria WHERE rubric_id=? ORDER BY position", (rubric_id,)).fetchall()


def score_rows(conn: sqlite3.Connection, event_id: str) -> list[dict]:
    rows = conn.execute("""SELECT p.id project_id,p.title,p.track_id,a.judge_user_id,
        r.id review_id,r.rubric_id,r.comment,r.submitted_at
        FROM reviews r JOIN assignments a ON a.id=r.assignment_id
        JOIN projects p ON p.id=a.project_id
        WHERE a.event_id=? AND r.status='submitted' AND p.duplicate_of IS NULL""", (event_id,)).fetchall()
    scores = []
    for row in rows:
        criteria = conn.execute("""SELECT c.code,c.weight,cs.value
            FROM criterion_scores cs JOIN criteria c ON c.id=cs.criterion_id
            WHERE cs.review_id=?""", (row["review_id"],)).fetchall()
        expected = conn.execute("SELECT COUNT(*) FROM criteria WHERE rubric_id=?", (row["rubric_id"],)).fetchone()[0]
        if len(criteria) != expected or not criteria:
            continue
        total_weight = sum(c["weight"] for c in criteria)
        raw = sum(c["weight"] * c["value"] for c in criteria) / total_weight
        scores.append({**dict(row), "raw": raw})
    return scores


def calculate_results(conn: sqlite3.Connection, event_id: str) -> list[dict]:
    """Shrink judge mean offsets toward zero within each track; no variance division."""
    scores = score_rows(conn, event_id)
    by_track: dict[str, list[dict]] = {}
    for score in scores:
        by_track.setdefault(score["track_id"] or "", []).append(score)
    adjusted: list[dict] = []
    for track_scores in by_track.values():
        global_mean = sum(s["raw"] for s in track_scores) / len(track_scores)
        by_judge: dict[str, list[dict]] = {}
        for score in track_scores:
            by_judge.setdefault(score["judge_user_id"], []).append(score)
        for judge_scores in by_judge.values():
            judge_mean = sum(s["raw"] for s in judge_scores) / len(judge_scores)
            shrinkage = len(judge_scores) / (len(judge_scores) + 4)
            offset = shrinkage * (judge_mean - global_mean)
            for score in judge_scores:
                adjusted.append({**score, "adjusted": max(1.0, min(5.0, score["raw"] - offset))})
    by_project: dict[str, list[dict]] = {}
    for score in adjusted:
        by_project.setdefault(score["project_id"], []).append(score)
    output = []
    projects = conn.execute("SELECT id,title,track_id,duplicate_of FROM projects WHERE event_id=? AND status='submitted'",
                            (event_id,)).fetchall()
    for project in projects:
        p_scores = by_project.get(project["id"], [])
        output.append({"project_id": project["id"], "title": project["title"],
                       "track_id": project["track_id"], "duplicate_of": project["duplicate_of"],
                       "review_count": len(p_scores),
                       "raw_score": sum(s["raw"] for s in p_scores) / len(p_scores) if p_scores else None,
                       "adjusted_score": sum(s["adjusted"] for s in p_scores) / len(p_scores) if p_scores else None})
    return sorted(output, key=lambda x: (x["track_id"] or "", x["adjusted_score"] is None,
                                          -(x["adjusted_score"] or 0), x["project_id"]))


def restore_archive(conn, event_id, archive, actor):
    """Restore a complete portable archive into an empty event, atomically.

    IDs are remapped, existing accounts are matched by email, and new historical
    identities are locked until an organizer-issued invitation activates them.
    Secrets are never imported, and certificates are signed anew at destination.
    """
    conn.execute("BEGIN IMMEDIATE")
    source = archive.get("event")
    require(isinstance(source, dict), 422, "Archive event is required")
    require(not conn.execute("SELECT 1 FROM teams WHERE event_id=?", (event_id,)).fetchone() and
            not conn.execute("SELECT 1 FROM assignments WHERE event_id=?", (event_id,)).fetchone(),
            409, "Restore a full archive into a new empty event")
    tables = ["tracks", "prizes", "event_questions", "event_roles", "judge_track_scopes", "voting_policies", "voter_access", "teams",
              "team_members", "projects", "project_details", "rubrics", "criteria", "assignments",
              "reviews", "criterion_scores", "votes", "comments", "result_snapshots", "audit_events"]
    for table in ["users", *tables]:
        rows = archive.get(table, [])
        require(isinstance(rows, list) and len(rows) <= 10000 and all(isinstance(r, dict) for r in rows),
                422, "Invalid archive table: " + table)
    mappings = {table: {str(row["id"]): uid("import") for row in archive.get(table, [])}
                for table in ["tracks", "prizes", "teams", "projects", "rubrics", "criteria", "assignments", "reviews", "votes", "comments"]}
    for table, mapping in mappings.items():
        require(len(mapping) == len(archive.get(table, [])), 422, "Duplicate source IDs in " + table)
    users, locked = {}, []
    for row in archive.get("users", []):
        email = clean(row.get("email", ""), 200).lower()
        require(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email), 422, "Invalid archived account email")
        account = user_by_email(conn, email)
        if not account:
            account_id = uid("archived")
            conn.execute("INSERT INTO users VALUES(?,?,?,?,?,?)",
                         (account_id, email, clean(row.get("name") or email, 100), "!imported", 0, iso()))
            account = conn.execute("SELECT * FROM users WHERE id=?", (account_id,)).fetchone()
            locked.append(email)
        users[str(row["id"])] = account["id"]
        if account["password_hash"] == "!imported":
            conn.execute("INSERT OR IGNORE INTO archive_accounts VALUES(?,?)", (event_id, account["id"]))
    mappings["users"] = users

    def mapped(table, value):
        require(str(value) in mappings[table], 422, f"Missing {table} reference: {value}")
        return mappings[table][str(value)]

    conn.execute("DELETE FROM criteria WHERE rubric_id IN (SELECT id FROM rubrics WHERE event_id=?)", (event_id,))
    for table in ["rubrics", "tracks", "prizes", "event_questions", "judge_track_scopes", "voting_policies", "voter_access"]:
        conn.execute("DELETE FROM " + table + " WHERE event_id=?", (event_id,))
    references = {"team_id":"teams", "track_id":"tracks", "project_id":"projects", "rubric_id":"rubrics",
                  "criterion_id":"criteria", "assignment_id":"assignments", "review_id":"reviews",
                  "user_id":"users", "judge_user_id":"users", "created_by":"users"}
    for table in tables:
        columns = {r[1] for r in conn.execute("PRAGMA table_info(" + table + ")")}
        for original in archive.get(table, []):
            row = {k:v for k,v in original.items() if k in columns}
            if "event_id" in columns:
                row["event_id"] = event_id
            if table in mappings:
                row["id"] = mapped(table, original["id"])
            if table == "audit_events":
                row.pop("id", None)
                row["actor_id"] = users.get(str(original.get("actor_id")))
                target = str(original.get("target_id"))
                row["target_id"] = next((m[target] for m in mappings.values() if target in m), original.get("target_id"))
            for key, target in references.items():
                if key in row and row[key] is not None:
                    row[key] = mapped(target, row[key])
            if table == "judge_track_scopes":
                scope = json.loads(row["track_ids"])
                row["track_ids"] = json.dumps(None if scope is None else [mapped("tracks", t) for t in scope])
            if table == "projects":
                row["duplicate_of"] = mapped("projects", row["duplicate_of"]) if row.get("duplicate_of") else None
                row["source_fixture_id"] = "archive:" + event_id + ":" + str(original["id"]) if row["duplicate_of"] else None
                require(row.get("status") in ("draft", "submitted"), 422, "Invalid project status")
            if table == "event_roles":
                require(row.get("role") in ("participant", "judge", "organizer"), 422, "Invalid archived role")
            names = list(row)
            verb = "INSERT OR IGNORE" if table == "event_roles" else "INSERT"
            conn.execute(verb + " INTO " + table + "(" + ",".join(names) + ") VALUES(" + ",".join("?" for _ in names) + ")",
                         [row[k] for k in names])
    for project in conn.execute("SELECT id FROM projects WHERE event_id=? AND status='submitted'", (event_id,)):
        validate_project_answers(conn, project["id"])
    require(source.get("status") in ("draft", "open", "judging", "voting", "published"), 422, "Invalid event status")
    require(bool(source.get("published_at")) == (source["status"] == "published"), 422, "Inconsistent publication state")
    dates = {key: iso(parse_time(source[key])) if source.get(key) else None
             for key in ("starts_at", "submissions_close", "judging_close", "voting_close", "published_at")}
    require(dates["starts_at"] and dates["submissions_close"] and dates["starts_at"] < dates["submissions_close"],
            422, "Invalid archive event dates")
    conn.execute("UPDATE events SET description=?,starts_at=?,submissions_close=?,judging_close=?,voting_close=?,published_at=?,status=? WHERE id=?",
                 (clean(source.get("description", ""), 2000), *dates.values(), source["status"], event_id))
    conn.execute("INSERT INTO archive_provenance VALUES(?,?,?,?)",
                 (event_id, json.dumps(source), json.dumps(archive.get("issued_records", [])), iso()))
    if dates["published_at"]:
        issue_event_records(conn, event_id, dates["published_at"])
    audit(conn, "archive_restore", actor["id"], event_id, detail=json.dumps({"source": source.get("id"), "locked_accounts": len(locked)}))
    return {"restored": True, "teams_created":len(archive.get("teams", [])),
            "projects_created":len(archive.get("projects", [])), "tracks_created":len(archive.get("tracks", [])),
            "prizes_created":len(archive.get("prizes", [])), "members_added":len(archive.get("team_members", [])),
            "members_skipped":0, "accounts_to_activate":locked,
            "history":{t:len(archive.get(t, [])) for t in ("reviews", "votes", "comments", "result_snapshots", "event_roles")}}


def issue_record(conn: sqlite3.Connection, event_id: str, kind: str,
                 subject_id: str, payload: dict, issued_at: str) -> None:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    secret = conn.execute("SELECT secret FROM signing_keys WHERE id=1").fetchone()["secret"]
    signature = hmac.new(bytes.fromhex(secret), encoded.encode("utf-8"), hashlib.sha256).hexdigest()
    conn.execute("""INSERT OR IGNORE INTO issued_records
        (id,event_id,kind,subject_id,payload_json,signature,issued_at) VALUES(?,?,?,?,?,?,?)""",
        (uid("rec"), event_id, kind, subject_id, encoded, signature, issued_at))


def issue_event_records(conn: sqlite3.Connection, event_id: str, issued_at: str) -> None:
    event = event_row(conn, event_id)
    judges = conn.execute("""SELECT u.id,u.name,COUNT(r.id) completed
        FROM assignments a JOIN users u ON u.id=a.judge_user_id
        JOIN reviews r ON r.assignment_id=a.id AND r.status='submitted'
        WHERE a.event_id=? GROUP BY u.id,u.name ORDER BY u.id""", (event_id,)).fetchall()
    for judge in judges:
        review_ids = [row["id"] for row in conn.execute("""SELECT r.id FROM reviews r
            JOIN assignments a ON a.id=r.assignment_id
            WHERE a.event_id=? AND a.judge_user_id=? AND r.status='submitted' ORDER BY r.id""",
            (event_id, judge["id"])).fetchall()]
        issue_record(conn, event_id, "judge", judge["id"],
                     {"type": "judge_participation", "event_id": event_id, "event_name": event["name"],
                      "judge_id": judge["id"], "judge_name": judge["name"],
                      "completed_reviews": judge["completed"],
                      "review_digest": hashlib.sha256("\n".join(review_ids).encode()).hexdigest(),
                      "issued_at": issued_at}, issued_at)
    projects = conn.execute("""SELECT p.id,p.title,t.name team_name FROM projects p
        JOIN teams t ON t.id=p.team_id WHERE p.event_id=? AND p.status='submitted'
        AND p.duplicate_of IS NULL ORDER BY p.id""", (event_id,)).fetchall()
    for project in projects:
        issue_record(conn, event_id, "project", project["id"],
                     {"type": "project_certificate", "event_id": event_id,
                      "event_name": event["name"], "project_id": project["id"],
                      "project_title": project["title"], "team_name": project["team_name"],
                      "issued_at": issued_at}, issued_at)


def verified_record(conn: sqlite3.Connection, record_id: str, signature: str) -> dict:
    record = conn.execute("SELECT * FROM issued_records WHERE id=?", (record_id,)).fetchone()
    require(record is not None, 404, "Record not found")
    secret = conn.execute("SELECT secret FROM signing_keys WHERE id=1").fetchone()["secret"]
    expected = hmac.new(bytes.fromhex(secret), record["payload_json"].encode("utf-8"),
                        hashlib.sha256).hexdigest()
    require(hmac.compare_digest(signature, record["signature"]) and
            hmac.compare_digest(expected, record["signature"]), 403, "Invalid signature")
    return {"id": record["id"], "kind": record["kind"], "payload": json.loads(record["payload_json"]),
            "signature": record["signature"], "verified": True}


WEBHOOK_DELIVERY_LOCK = threading.Lock()


def deliver_pending_webhooks() -> None:
    """Deliver a bounded batch after the event transaction has committed."""
    if not WEBHOOK_DELIVERY_LOCK.acquire(blocking=False):
        return
    try:
        for _ in range(5):
            with db() as conn:
                row = conn.execute("""SELECT d.id,d.payload_json,h.url,h.secret
                    FROM webhook_deliveries d JOIN webhooks h ON h.id=d.webhook_id
                    WHERE d.delivered_at IS NULL AND d.attempts<3 AND h.active=1
                    ORDER BY d.created_at,d.id LIMIT 1""").fetchone()
                if row is None:
                    break
                conn.execute("UPDATE webhook_deliveries SET attempts=attempts+1 WHERE id=?", (row["id"],))
            body = row["payload_json"].encode("utf-8")
            signature = hmac.new(bytes.fromhex(row["secret"]), body, hashlib.sha256).hexdigest()
            request = Request(row["url"], data=body, method="POST", headers={
                "Content-Type": "application/json", "X-Dogfood-Signature": "sha256=" + signature,
                "X-Dogfood-Delivery": row["id"],
            })
            try:
                with urlopen(request, timeout=2) as response:
                    require(200 <= response.status < 300, 502, "Webhook endpoint rejected delivery")
                with db() as conn:
                    conn.execute("UPDATE webhook_deliveries SET delivered_at=?,last_error='' WHERE id=?",
                                 (iso(), row["id"]))
            except Exception as exc:
                with db() as conn:
                    conn.execute("UPDATE webhook_deliveries SET last_error=? WHERE id=?",
                                 (str(exc)[:200], row["id"]))
                break
    finally:
        WEBHOOK_DELIVERY_LOCK.release()


class PortalHandler(BaseHTTPRequestHandler):
    server_version = "DOGFOOD/0.1"

    def do_GET(self) -> None:
        self.handle_request("GET")

    def do_POST(self) -> None:
        self.handle_request("POST")

    def do_PATCH(self) -> None:
        self.handle_request("PATCH")

    def do_PUT(self) -> None:
        self.handle_request("PUT")

    def do_DELETE(self) -> None:
        self.handle_request("DELETE")

    def send_bytes(self, status: int, body: bytes, content_type: str,
                   headers: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Cache-Control", "no-store" if content_type.startswith("application/json") else "no-cache")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status: int, value: object, headers: dict[str, str] | None = None) -> None:
        self.send_bytes(status, json.dumps(value, ensure_ascii=False, default=str).encode("utf-8"),
                        "application/json; charset=utf-8", headers)

    def body_json(self) -> dict:
        size = int(self.headers.get("Content-Length", "0"))
        require(size <= 1_000_000, 413, "Request body too large")
        try:
            body = json.loads(self.rfile.read(size) or b"{}")
        except json.JSONDecodeError:
            raise ApiError(400, "Invalid JSON")
        require(isinstance(body, dict), 422, "Expected JSON object")
        return body

    def current_user(self, conn: sqlite3.Connection) -> sqlite3.Row | None:
        auth = self.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else ""
        if not token:
            cookie = SimpleCookie()
            try:
                cookie.load(self.headers.get("Cookie", ""))
                token = cookie["session"].value if "session" in cookie else ""
            except Exception:
                token = ""
        if not token:
            return None
        return conn.execute("""SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
            WHERE s.token_hash=? AND s.expires_at>?""", (token_hash(token), iso())).fetchone()

    def must_user(self, user: sqlite3.Row | None) -> sqlite3.Row:
        require(user is not None, 401, "Authentication required")
        return user

    def must_role(self, conn: sqlite3.Connection, user: sqlite3.Row | None,
                  event_id: str, wanted: str) -> sqlite3.Row:
        self.must_user(user)
        if not role(conn, user, event_id, wanted):
            audit(conn, "access_denied", user["id"], event_id, detail="Required role: " + wanted)
            conn.commit()
            raise ApiError(403, "Forbidden")
        return user

    def handle_request(self, method: str) -> None:
        parsed = urlsplit(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path.startswith("/dogfood-api/"):
            path = "/api/" + path[len("/dogfood-api/"):]
        query = parse_qs(parsed.query)
        try:
            if method not in ("GET",) and self.headers.get("Cookie") and not self.headers.get("Authorization"):
                origin = self.headers.get("Origin")
                host = self.headers.get("Host", "")
                require(not origin or urlsplit(origin).netloc == host, 403, "Cross-origin write refused")
            with db() as conn:
                user = self.current_user(conn)
                if path.startswith("/api/") or path == "/api":
                    self.api(conn, user, method, path, query)
                elif method == "GET":
                    self.page(conn, user, path, query)
                else:
                    raise ApiError(404, "Route not found")
            if method not in ("GET", "HEAD"):
                try:
                    deliver_pending_webhooks()
                except Exception as exc:
                    print("Webhook delivery error:", repr(exc), file=sys.stderr)
        except ApiError as exc:
            self.send_json(exc.status, {"error": exc.message})
        except sqlite3.IntegrityError as exc:
            self.send_json(409, {"error": "Conflict or invalid relationship", "detail": str(exc)})
        except (ValueError, TypeError, KeyError) as exc:
            self.send_json(422, {"error": "Invalid input", "detail": str(exc)})
        except Exception as exc:
            print("Server error:", repr(exc), file=sys.stderr)
            self.send_json(500, {"error": "Internal server error"})

    def page(self, conn: sqlite3.Connection, user: sqlite3.Row | None,
             path: str, query: dict) -> None:
        if path == "/health":
            conn.execute("SELECT 1 FROM events LIMIT 1").fetchone()
            self.send_json(200, {"status": "ready"})
            return
        if re.fullmatch(r"/(verify|certificates)/rec_[a-f0-9]+", path):
            record_id = path.rsplit("/", 1)[1]
            record = verified_record(conn, record_id, query.get("sig", [""])[0])
            payload = record["payload"]
            title = payload.get("project_title") or payload.get("judge_name") or "DOGFOOD record"
            description = ("Project participation certificate" if record["kind"] == "project"
                           else "Judge participation record")
            details = (payload.get("team_name", "") if record["kind"] == "project"
                       else str(payload.get("completed_reviews", 0)) + " completed reviews")
            markup = """<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Verified record · DOGFOOD</title><link rel='stylesheet' href='/assets/site.css'><body><header class='topbar'><a class='brand' href='/'>DOGFOOD<span> / PORTAL</span></a></header><main class='workspace'><article class='panel' style='max-width:750px;margin:60px auto;padding:50px;text-align:center'><p class='eyebrow'>SIGNED · VERIFIED</p><h1>""" + html.escape(description) + """</h1><p>Presented to</p><h2>""" + html.escape(title) + """</h2><p>""" + html.escape(details) + """</p><p>""" + html.escape(payload["event_name"]) + """ · """ + html.escape(payload["issued_at"][:10]) + """</p><small>Record """ + html.escape(record_id) + """ · The portal verified this record's signature against its local signing key.</small></article></main></body></html>"""
            self.send_bytes(200, markup.encode("utf-8"), "text/html; charset=utf-8")
            return
        if re.fullmatch(r"/embed/events/[^/]+", path):
            event_id = path.split("/")[3]
            event = event_row(conn, event_id)
            limit_count = max(1, min(48, int(query.get("limit", ["12"])[0])))
            projects = conn.execute("""SELECT id,title,summary FROM projects
                WHERE event_id=? AND status='submitted' AND duplicate_of IS NULL
                ORDER BY title LIMIT ?""", (event_id, limit_count)).fetchall()
            cards = "".join("<article><h2>" + html.escape(p["title"]) + "</h2><p>" +
                            html.escape(p["summary"]) + "</p><a target='_blank' rel='noopener noreferrer' href='/projects/" +
                            html.escape(p["id"], quote=True) + "'>View project ↗</a></article>" for p in projects)
            markup = """<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>""" + html.escape(event["name"]) + """ · DOGFOOD gallery</title><style>body{margin:0;padding:24px;background:#f5f2e9;color:#17342d;font:14px/1.5 system-ui,sans-serif}header{margin-bottom:18px}small{font-weight:800;letter-spacing:.14em;color:#bb634e}h1{margin:5px 0;font:500 30px Georgia,serif}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}article{padding:19px;background:#fffdf7;border:1px solid #dce4d9;border-radius:14px}h2{font:600 21px Georgia,serif;margin:0}p{color:#53675b}a{color:#b85c45;font-weight:800;text-decoration:none}</style><header><small>DOGFOOD / PUBLIC GALLERY</small><h1>""" + html.escape(event["name"]) + """</h1></header><main>""" + (cards or "<p>No projects submitted yet.</p>") + """</main></html>"""
            self.send_bytes(200, markup.encode("utf-8"), "text/html; charset=utf-8")
            return
        if path == "/assets/site.css":
            self.send_bytes(200, (ROOT / "src" / "site.css").read_bytes(), "text/css; charset=utf-8")
            return
        if re.fullmatch(r"/assets/[A-Za-z0-9_.-]+", path):
            asset = ROOT / "dist" / path.lstrip("/")
            require(asset.is_file(), 404, "Asset not found")
            self.send_bytes(200, asset.read_bytes(), mimetypes.guess_type(asset.name)[0] or "application/octet-stream")
            return
        if path.startswith("/join/") or path.startswith("/role-invite/") or path.startswith("/vote-invite/"):
            parts = path.strip("/").split("/")
            require(len(parts) == 2 and re.fullmatch(r"[A-Za-z0-9_-]{20,100}", parts[1]) is not None,
                    404, "Invalid invitation link")
            endpoint = {"join":"/api/invites/", "role-invite":"/api/role-invites/", "vote-invite":"/api/voter-invites/"}[parts[0]]
            label = "team" if parts[0] == "join" else "community ballot" if parts[0] == "vote-invite" else "event role"
            page = """<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Accept invitation · DOGFOOD</title><link rel='stylesheet' href='/assets/site.css'><body><header class='topbar'><a class='brand' href='/'>DOGFOOD<span> / PORTAL</span></a></header><main class='workspace'><div class='panel' style='max-width:560px;margin:60px auto'><p class='eyebrow'>YOU ARE INVITED</p><h2>Join this """ + label + """.</h2><p id='message'>Sign in or create an account, then accept the invitation.</p><form id='auth' class='form-stack'><label>Name (new accounts only)<input name='name'></label><label>Email<input name='email' type='email' required></label><label>Password<input name='password' type='password' required></label><div class='inline-actions'><button name='mode' value='login' class='button ghost'>Sign in</button><button name='mode' value='register' class='button ghost'>Create account</button></div></form><button id='accept' class='button primary' style='margin-top:20px'>Accept invitation →</button></div></main><script>const endpoint=""" + json.dumps(endpoint + parts[1] + "/accept") + """;const message=document.getElementById('message');async function request(path,method,body){const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin'});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data}document.getElementById('auth').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{await request('/api/'+e.submitter.value,'POST',{...Object.fromEntries(f),invite_token:location.pathname.split('/').pop()});message.textContent='Signed in. Accept the invitation below.'}catch(err){message.textContent=err.message}};document.getElementById('accept').onclick=async()=>{try{await request(endpoint,'POST',{});message.textContent='Invitation accepted. Open your workspace to continue.';document.getElementById('accept').disabled=true}catch(err){message.textContent=err.message}};</script></body></html>"""
            self.send_bytes(200, page.encode("utf-8"), "text/html; charset=utf-8")
            return
        if path == "/projects" or re.fullmatch(r"/events/[^/]+/projects", path):
            event_id = path.split("/")[2] if path.startswith("/events/") else "evt_01"
            event = event_row(conn, event_id)
            search = clean(query.get("q", [""])[0], 100)
            track = clean(query.get("track", [""])[0], 80)
            filters = ["p.event_id=?", "p.status='submitted'"]
            values: list[object] = [event_id]
            if search:
                filters.append("(p.title LIKE ? OR p.summary LIKE ?)")
                values.extend(["%" + search + "%", "%" + search + "%"])
            if track:
                filters.append("p.track_id=?")
                values.append(track)
            projects = conn.execute("""SELECT p.*,t.name track_name FROM projects p
                LEFT JOIN tracks t ON t.id=p.track_id WHERE """ + " AND ".join(filters) +
                " ORDER BY p.title LIMIT 100", values).fetchall()
            tracks = conn.execute("SELECT * FROM tracks WHERE event_id=? ORDER BY name", (event_id,)).fetchall()
            cards = "".join("<article class='project-card'><span class='eyebrow'>" + html.escape(p["track_name"] or "General") +
                            "</span><h2>" + html.escape(p["title"]) + "</h2><p>" + html.escape(p["summary"]) +
                            "</p><a href='" + html.escape(p["repo_url"] or "#", quote=True) +
                            "' rel='noopener noreferrer'>View repository ↗</a> · <a href='/projects/" +
                            html.escape(p["id"], quote=True) + "'>Read comments</a>" +
                            ("<span class='flag'>Duplicate under review</span>" if p["duplicate_of"] else "") +
                            "</article>" for p in projects)
            options = "".join("<option value='" + html.escape(t["id"], quote=True) + "'" +
                              (" selected" if t["id"] == track else "") + ">" + html.escape(t["name"]) +
                              "</option>" for t in tracks)
            markup = """<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>
            <title>""" + html.escape(event["name"]) + " · Projects</title><link rel='stylesheet' href='/assets/site.css'><body><header class='topbar'><a class='brand' href='/'>DOGFOOD<span> / PORTAL</span></a><nav><a href='/'>Dashboard</a><a href='/projects'>Gallery</a></nav></header><main class='gallery'><div class='gallery-head'><span class='eyebrow'>PUBLIC GALLERY</span><h1>" + html.escape(event["name"]) + "</h1><p>Explore the work, search by name, and filter by track.</p></div><form class='gallery-filter' method='get'><input name='q' placeholder='Search projects' value='" + html.escape(search, quote=True) + "'><select name='track'><option value=''>All tracks</option>" + options + "</select><button>Explore</button></form><div class='project-grid'>" + (cards or "<p>No projects match your filters.</p>") + "</div></main></body></html>"
            self.send_bytes(200, markup.encode("utf-8"), "text/html; charset=utf-8")
            return
        if re.fullmatch(r"/projects/[^/]+", path):
            project_id = path.split("/")[2]
            project = conn.execute("""SELECT p.*,t.name track_name,e.name event_name
                FROM projects p LEFT JOIN tracks t ON t.id=p.track_id
                JOIN events e ON e.id=p.event_id WHERE p.id=? AND p.status='submitted'""",
                (project_id,)).fetchone()
            require(project is not None, 404, "Published project not found")
            comments = conn.execute("""SELECT c.body,c.created_at,u.name author
                FROM comments c JOIN users u ON u.id=c.user_id
                WHERE c.project_id=? AND c.status='visible' ORDER BY c.created_at""",
                (project_id,)).fetchall()
            entries = "".join("<article class='project-card'><strong>" + html.escape(c["author"]) +
                              "</strong><p>" + html.escape(c["body"]) + "</p></article>" for c in comments)
            markup = """<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>""" + html.escape(project["title"]) + """ · DOGFOOD</title><link rel='stylesheet' href='/assets/site.css'><body><header class='topbar'><a class='brand' href='/'>DOGFOOD<span> / PORTAL</span></a><nav><a href='/'>Dashboard</a><a href='/events/""" + html.escape(project["event_id"], quote=True) + """/projects'>Gallery</a></nav></header><main class='gallery'><div class='gallery-head'><span class='eyebrow'>""" + html.escape(project["track_name"] or "General") + """</span><h1>""" + html.escape(project["title"]) + """</h1><p>""" + html.escape(project["summary"]) + """</p></div><h2>Community comments</h2><div class='project-grid'>""" + (entries or "<p>No comments yet.</p>") + """</div><p>Open the portal to sign in and add a comment.</p></main></body></html>"""
            self.send_bytes(200, markup.encode("utf-8"), "text/html; charset=utf-8")
            return
        if path == "/":
            index = ROOT / "dist" / "index.html"
            require(index.is_file(), 503, "Build the DOGFOOD frontend before opening the portal")
            self.send_bytes(200, index.read_bytes(), "text/html; charset=utf-8")
            return
        raise ApiError(404, "Page not found")

    def api(self, conn: sqlite3.Connection, user: sqlite3.Row | None,
            method: str, path: str, query: dict) -> None:
        parts = path.strip("/").split("/")
        if path == "/api/openapi.json" and method == "GET":
            self.send_bytes(200, (ROOT / "src" / "openapi.json").read_bytes(),
                            "application/json; charset=utf-8")
            return
        if path == "/api/me" and method == "GET":
            self.send_json(200, {"demo_mode": DEMO_MODE, "user": {"id": user["id"], "email": user["email"],
                                          "name": user["name"], "is_admin": bool(user["is_admin"])} if user else None,
                                 "roles": [dict(r) for r in conn.execute("SELECT event_id,role FROM event_roles WHERE user_id=?",
                                                                           (user["id"],)).fetchall()] if user else []})
            return
        if len(parts) == 3 and parts[:2] == ["api", "records"] and method == "GET":
            self.send_json(200, verified_record(conn, parts[2], query.get("sig", [""])[0]))
            return
        if path == "/api/register" and method == "POST":
            body = self.body_json()
            email = clean(body.get("email", ""), 200).lower()
            name = clean(body.get("name", ""), 100)
            password = body.get("password", "")
            require(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) is not None, 422, "Valid email required")
            require(len(name) >= 2 and isinstance(password, str) and len(password) >= 10, 422,
                    "Name and password of at least ten characters required")
            existing = user_by_email(conn, email)
            if existing:
                invitation = conn.execute("SELECT * FROM role_invites WHERE token_hash=?",
                                          (token_hash(str(body.get("invite_token", ""))),)).fetchone()
                require(existing["password_hash"] == "!imported" and invitation is not None and
                        invitation["email"] == email and not invitation["accepted_at"] and
                        parse_time(invitation["expires_at"]) > now() and
                        conn.execute("SELECT 1 FROM archive_accounts WHERE event_id=? AND user_id=?",
                                     (invitation["event_id"], existing["id"])).fetchone(),
                        409, "Email already registered; imported accounts need an invitation from their restored event")
                account = existing["id"]
                conn.execute("UPDATE users SET password_hash=?,name=? WHERE id=?", (password_hash(password), name, account))
            else:
                account = create_user(conn, email, name, password)
            token = create_session(conn, account)
            audit(conn, "register", account)
            self.send_json(201, {"id": account, "name": name},
                           {"Set-Cookie": "session=" + token + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800"})
            return
        if path == "/api/login" and method == "POST":
            body = self.body_json()
            account = user_by_email(conn, clean(body.get("email", ""), 200))
            require(account is not None and verify_password(body.get("password", ""), account["password_hash"]),
                    401, "Invalid email or password")
            token = create_session(conn, account["id"])
            audit(conn, "login", account["id"])
            self.send_json(200, {"id": account["id"], "name": account["name"]},
                           {"Set-Cookie": "session=" + token + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800"})
            return
        if path == "/api/logout" and method == "POST":
            self.must_user(user)
            auth = self.headers.get("Authorization", "")
            cookie = SimpleCookie()
            cookie.load(self.headers.get("Cookie", ""))
            token = auth[7:] if auth.startswith("Bearer ") else (cookie["session"].value if "session" in cookie else "")
            conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash(token),))
            audit(conn, "logout", user["id"])
            self.send_json(200, {"ok": True}, {"Set-Cookie": "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"})
            return
        if path == "/api/events" and method == "GET":
            rows = conn.execute("SELECT * FROM events ORDER BY created_at DESC").fetchall()
            self.send_json(200, {"events": [{**dict(r), "can_manage": can_manage(conn, user, r["id"]),
                                             "can_judge": role(conn, user, r["id"], "judge"),
                                             "can_participate": role(conn, user, r["id"], "participant")}
                                            for r in rows]})
            return
        if path == "/api/events" and method == "POST":
            actor = self.must_user(user)
            body = self.body_json()
            name = clean(body.get("name", ""), 120)
            description = clean(body.get("description", ""), 2000)
            starts = clean(body.get("starts_at", ""), 60)
            closes = clean(body.get("submissions_close", ""), 60)
            require(name and starts and closes, 422, "Name and dates required")
            require(parse_time(starts) < parse_time(closes), 422, "Start must precede submission close")
            judging = clean(body.get("judging_close") or "", 60)
            voting = clean(body.get("voting_close") or "", 60)
            require(not judging or parse_time(closes) < parse_time(judging), 422,
                    "Judging close must follow submission close")
            require(not voting or parse_time(judging or closes) < parse_time(voting), 422,
                    "Voting close must follow judging or submission close")
            tracks = body.get("tracks")
            prizes = body.get("prizes", [])
            require(isinstance(tracks, list) and 1 <= len(tracks) <= 50 and
                    all(isinstance(item, str) and item.strip() for item in tracks), 422,
                    "At least one named track is required")
            track_names = [clean(item, 80) for item in tracks]
            require(len(set(name.casefold() for name in track_names)) == len(track_names), 422,
                    "Track names must be unique")
            require(isinstance(prizes, list) and len(prizes) <= 50 and
                    all(isinstance(item, dict) and isinstance(item.get("title"), str) and
                        item["title"].strip() for item in prizes), 422,
                    "Prizes must have titles")
            event_id = uid("evt")
            conn.execute("""INSERT INTO events(id,name,description,starts_at,submissions_close,
                judging_close,voting_close,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (event_id, name, description, iso(parse_time(starts)), iso(parse_time(closes)),
                 iso(parse_time(judging)) if judging else None, iso(parse_time(voting)) if voting else None,
                 "open", actor["id"], iso()))
            conn.execute("INSERT INTO event_roles VALUES(?,?,?)", (event_id, actor["id"], "organizer"))
            for track_name in track_names:
                conn.execute("INSERT INTO tracks VALUES(?,?,?)", (uid("trk"), event_id, track_name))
            default_rubric = uid("rubric")
            conn.execute("INSERT INTO rubrics VALUES(?,?,?,?,?)", (default_rubric, event_id, 1, 1, iso()))
            for position, code in enumerate(("functionality", "quality", "innovation")):
                conn.execute("INSERT INTO criteria VALUES(?,?,?,?,?,?,?,?)",
                             (uid("cri"), default_rubric, code, code.title(), 1, 1, 5, position))
            for prize in prizes:
                conn.execute("INSERT INTO prizes VALUES(?,?,?,?)", (uid("prz"), event_id,
                            clean(prize.get("title", ""), 100), clean(prize.get("description", ""), 500)))
            audit(conn, "event_create", actor["id"], event_id)
            self.send_json(201, {"id": event_id})
            return
        if len(parts) >= 3 and parts[:2] == ["api", "events"]:
            event_id = parts[2]
            event = event_row(conn, event_id)
            if len(parts) == 3 and method == "GET":
                tracks = [dict(r) for r in conn.execute("SELECT id,name FROM tracks WHERE event_id=? ORDER BY name", (event_id,))]
                prizes = [dict(r) for r in conn.execute("SELECT id,title,description FROM prizes WHERE event_id=?", (event_id,))]
                self.send_json(200, {"event": dict(event), "tracks": tracks, "prizes": prizes,
                                     "voting_policy": voting_policy(conn, event_id),
                                     "voting_policy_locked": bool(event["published_at"] or conn.execute("SELECT 1 FROM votes WHERE event_id=?", (event_id,)).fetchone()),
                                     "questions": [dict(r) for r in conn.execute("SELECT * FROM event_questions WHERE event_id=? ORDER BY position", (event_id,))],
                                     "questions_locked": bool(conn.execute("SELECT 1 FROM projects WHERE event_id=? AND status='submitted'", (event_id,)).fetchone()),
                                     "can_manage": can_manage(conn, user, event_id),
                                     "can_participate": role(conn, user, event_id, "participant"),
                                     "can_judge": role(conn, user, event_id, "judge")})
                return
            if len(parts) == 3 and method == "PATCH":
                self.must_role(conn, user, event_id, "organizer")
                body = self.body_json()
                allowed = {"name", "description", "starts_at", "submissions_close", "judging_close", "voting_close", "status"}
                updates = {k: body[k] for k in allowed if k in body}
                require(updates, 422, "No changes supplied")
                require(not event["published_at"] or set(updates) <= {"name", "description"}, 409,
                        "Published event timing and status are frozen")
                for key, value in updates.items():
                    if key in {"starts_at", "submissions_close", "judging_close", "voting_close"} and value:
                        updates[key] = iso(parse_time(value))
                    elif key in {"name", "description"}:
                        updates[key] = clean(value, 2000 if key == "description" else 120)
                require(updates.get("name", event["name"]), 422, "Event name required")
                require(updates.get("status", event["status"]) in {"draft", "open", "judging", "voting", "published"},
                        422, "Invalid status")
                require(updates.get("status") != "published" or event["published_at"], 409,
                        "Publish through the results endpoint")
                require(not event["published_at"] or updates.get("status", "published") == "published", 409,
                        "Published status cannot be reversed")
                start = parse_time(updates.get("starts_at", event["starts_at"]))
                close = parse_time(updates.get("submissions_close", event["submissions_close"]))
                require(start < close, 422, "Start must precede submission close")
                judging = updates.get("judging_close", event["judging_close"])
                voting = updates.get("voting_close", event["voting_close"])
                require(not judging or close < parse_time(judging), 422,
                        "Judging close must follow submission close")
                require(not voting or (parse_time(judging) if judging else close) < parse_time(voting), 422,
                        "Voting close must follow judging or submission close")
                conn.execute("UPDATE events SET " + ",".join(k + "=?" for k in updates) + " WHERE id=?",
                             [*updates.values(), event_id])
                audit(conn, "event_update", user["id"], event_id, detail=",".join(updates))
                self.send_json(200, {"ok": True})
                return
            if len(parts) == 4 and parts[3] == "voting-policy" and method == "PUT":
                self.must_role(conn, user, event_id, "organizer")
                conn.execute("BEGIN IMMEDIATE")
                event = event_row(conn, event_id)
                require(not event["published_at"] and not conn.execute("SELECT 1 FROM votes WHERE event_id=?", (event_id,)).fetchone(),
                        409, "Voting access is locked after the first vote")
                mode = self.body_json().get("mode")
                require(mode in ("authenticated", "invitation"), 422, "Choose authenticated or invitation access")
                conn.execute("INSERT OR REPLACE INTO voting_policies VALUES(?,?)", (event_id, mode))
                audit(conn, "voting_policy_update", user["id"], event_id, detail=mode)
                self.send_json(200, {"mode": mode})
                return
            if len(parts) == 4 and parts[3] == "voter-invites" and method == "POST":
                self.must_role(conn, user, event_id, "organizer")
                require(not event["published_at"] and (not event["voting_close"] or now() < parse_time(event["voting_close"])),
                        409, "Voting is closed")
                email = clean(self.body_json().get("email", ""), 200).lower()
                require(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email), 422, "Valid voter email required")
                token = secrets.token_urlsafe(32)
                conn.execute("INSERT INTO voter_invites VALUES(?,?,?,?,?)", (token_hash(token), event_id, email, iso(now()+timedelta(days=7)), None))
                audit(conn, "voter_invite_create", user["id"], event_id, detail=email)
                self.send_json(201, {"email": email, "invite_path": "/vote-invite/"+token})
                return
            if len(parts) == 4 and parts[3] == "questions" and method == "PUT":
                self.must_role(conn, user, event_id, "organizer")
                require(not event["published_at"] and now() < parse_time(event["submissions_close"]), 409,
                        "Questions are locked after submissions close")
                require(not conn.execute("SELECT 1 FROM projects WHERE event_id=? AND status='submitted'", (event_id,)).fetchone(),
                        409, "Questions are locked after the first submission")
                questions = self.body_json().get("questions")
                require(isinstance(questions, list) and len(questions) <= 20, 422, "Supply up to twenty questions")
                conn.execute("DELETE FROM event_questions WHERE event_id=?", (event_id,))
                seen = set()
                for position, question in enumerate(questions):
                    code, label = clean(question.get("code", ""), 80), clean(question.get("label", ""), 300)
                    require(re.fullmatch(r"[a-z][a-z0-9_]*", code) and code not in seen and label, 422,
                            "Each question needs a unique lowercase code and a label")
                    seen.add(code)
                    conn.execute("INSERT INTO event_questions VALUES(?,?,?,?,?)",
                                 (event_id, code, label, int(bool(question.get("required"))), position))
                audit(conn, "questions_update", user["id"], event_id, detail=str(len(questions)))
                self.send_json(200, {"ok": True})
                return
            if len(parts) == 4 and parts[3] == "tracks" and method == "POST":
                self.must_role(conn, user, event_id, "organizer")
                name = clean(self.body_json().get("name", ""), 80)
                require(name, 422, "Track name required")
                track_id = uid("trk")
                conn.execute("INSERT INTO tracks VALUES(?,?,?)", (track_id, event_id, name))
                audit(conn, "track_create", user["id"], event_id, track_id)
                self.send_json(201, {"id": track_id})
                return
            if len(parts) == 4 and parts[3] == "prizes" and method == "POST":
                self.must_role(conn, user, event_id, "organizer")
                body = self.body_json()
                title = clean(body.get("title", ""), 100)
                require(title, 422, "Prize title required")
                prize_id = uid("prz")
                conn.execute("INSERT INTO prizes VALUES(?,?,?,?)", (prize_id, event_id,
                            title, clean(body.get("description", ""), 500)))
                audit(conn, "prize_create", user["id"], event_id, prize_id)
                self.send_json(201, {"id": prize_id})
                return
            if len(parts) == 4 and parts[3] == "roles" and method == "POST":
                self.must_role(conn, user, event_id, "organizer")
                body = self.body_json()
                account = user_by_email(conn, clean(body.get("email", ""), 200))
                wanted = clean(body.get("role", ""), 20)
                require(account is not None, 404, "Invitee must register first")
                require(wanted in ("judge", "participant", "organizer"), 422, "Invalid role")
                conn.execute("INSERT OR IGNORE INTO event_roles VALUES(?,?,?)", (event_id, account["id"], wanted))
                if wanted == "judge" and "track_ids" in body:
                    scope = validate_track_scope(conn, event_id, body["track_ids"])
                    conn.execute("INSERT OR REPLACE INTO judge_track_scopes VALUES(?,?,?)",
                                 (event_id, account["id"], json.dumps(scope)))
                audit(conn, "role_invite", user["id"], event_id, account["id"], wanted)
                self.send_json(200, {"ok": True, "user_id": account["id"]})
                return
            if len(parts) == 4 and parts[3] == "role-invites" and method == "POST":
                self.must_role(conn, user, event_id, "organizer")
                body = self.body_json()
                email = clean(body.get("email", ""), 200).lower()
                wanted = clean(body.get("role", ""), 20)
                require(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) is not None, 422,
                        "Valid invitee email required")
                require(wanted in ("participant", "judge", "organizer"), 422, "Invalid role")
                token = secrets.token_urlsafe(32)
                conn.execute("INSERT INTO role_invites VALUES(?,?,?,?,?,?,?)",
                             (token_hash(token), event_id, email, wanted,
                              iso(now() + timedelta(days=7)), None, user["id"]))
                if wanted == "judge":
                    scope = validate_track_scope(conn, event_id, body.get("track_ids"))
                    conn.execute("INSERT INTO role_invite_scopes VALUES(?,?)", (token_hash(token), json.dumps(scope)))
                audit(conn, "role_invite_create", user["id"], event_id, detail=wanted + ":" + email)
                self.send_json(201, {"invite_path": "/role-invite/" + token, "email": email, "role": wanted})
                return
            if len(parts) == 4 and parts[3] == "teams" and method == "GET":
                self.must_user(user)
                teams = conn.execute("SELECT * FROM teams WHERE event_id=? ORDER BY name", (event_id,)).fetchall()
                self.send_json(200, {"teams": [{**dict(t), "member_count": conn.execute(
                    "SELECT COUNT(*) FROM team_members WHERE team_id=?", (t["id"],)).fetchone()[0],
                    "is_member": is_team_member(conn, user, t["id"])} for t in teams]})
                return
            if len(parts) == 4 and parts[3] == "teams" and method == "POST":
                self.must_user(user)
                require_submission_open(event)
                body = self.body_json()
                name = clean(body.get("name", ""), 100)
                require(name, 422, "Team name required")
                already = conn.execute("""SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id
                    WHERE t.event_id=? AND tm.user_id=?""", (event_id, user["id"])).fetchone()
                require(not already, 409, "Already in a team for this event")
                team_id = uid("tm")
                conn.execute("INSERT INTO teams VALUES(?,?,?,?,?)", (team_id, event_id, name, user["id"], iso()))
                conn.execute("INSERT INTO team_members VALUES(?,?,?)", (team_id, user["id"], iso()))
                conn.execute("INSERT OR IGNORE INTO event_roles VALUES(?,?,?)", (event_id, user["id"], "participant"))
                audit(conn, "team_create", user["id"], event_id, team_id)
                self.send_json(201, {"id": team_id})
                return
            if len(parts) == 4 and parts[3] == "projects" and method == "GET":
                filters = ["p.event_id=?"]
                values: list[object] = [event_id]
                if not can_manage(conn, user, event_id):
                    filters.append("(p.status='submitted' OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=p.team_id AND tm.user_id=?))")
                    values.append(user["id"] if user else "")
                rows = conn.execute("SELECT p.* FROM projects p WHERE " + " AND ".join(filters) +
                                    " ORDER BY p.title", values).fetchall()
                self.send_json(200, {"projects": [project_payload(conn, r) for r in rows]})
                return
            if len(parts) == 4 and parts[3] == "projects" and method == "POST":
                self.must_user(user)
                require_submission_open(event)
                self.must_role(conn, user, event_id, "participant")
                body = self.body_json()
                team_id = clean(body.get("team_id", ""), 100)
                require(is_team_member(conn, user, team_id), 403, "Not a member of this team")
                team = conn.execute("SELECT * FROM teams WHERE id=? AND event_id=?", (team_id, event_id)).fetchone()
                require(team is not None, 422, "Team belongs to another event")
                track_id = clean(body.get("track_id", ""), 100)
                require(conn.execute("SELECT 1 FROM tracks WHERE id=? AND event_id=?", (track_id, event_id)).fetchone() is not None,
                        422, "Choose a track from this event")
                title = clean(body.get("title", ""), 150)
                require(title, 422, "Project title required")
                project_id = uid("prj")
                status = "submitted" if body.get("submit") is True else "draft"
                conn.execute("""INSERT INTO projects(id,event_id,team_id,track_id,title,summary,repo_url,status,
                    submitted_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                    (project_id, event_id, team_id, track_id, title, clean(body.get("summary", ""), 3000),
                     repo_url(body.get("repo_url", "")), status, iso() if status == "submitted" else None, iso(), iso()))
                save_project_details(conn, project_id, body)
                if status == "submitted":
                    validate_project_answers(conn, project_id)
                audit(conn, "project_create", user["id"], event_id, project_id, status)
                self.send_json(201, {"id": project_id, "status": status})
                return
            if len(parts) == 4 and parts[3] == "rubric" and method == "GET":
                rubric = active_rubric(conn, event_id)
                self.send_json(200, {"rubric": dict(rubric), "criteria": [dict(c) for c in rubric_criteria(conn, rubric["id"])]})
                return
            if len(parts) == 4 and parts[3] == "rubric" and method == "POST":
                self.must_role(conn, user, event_id, "organizer")
                require(event["published_at"] is None, 409, "Published results cannot change")
                body = self.body_json()
                items = body.get("criteria", [])
                require(isinstance(items, list) and 1 <= len(items) <= 20, 422, "Supply one to twenty criteria")
                version = conn.execute("SELECT COALESCE(MAX(version),0)+1 FROM rubrics WHERE event_id=?",
                                       (event_id,)).fetchone()[0]
                rubric_id = uid("rubric")
                conn.execute("UPDATE rubrics SET active=0 WHERE event_id=?", (event_id,))
                conn.execute("INSERT INTO rubrics VALUES(?,?,?,?,?)", (rubric_id, event_id, version, 1, iso()))
                codes: set[str] = set()
                for pos, item in enumerate(items):
                    code = clean(item.get("code", ""), 40)
                    label = clean(item.get("label", ""), 100)
                    weight = float(item.get("weight", 0))
                    minimum = float(item.get("min_score", 1))
                    maximum = float(item.get("max_score", 5))
                    require(re.fullmatch(r"[a-z][a-z0-9_]*", code) is not None and code not in codes,
                            422, "Criterion codes must be unique identifiers")
                    require(label and 0 < weight <= 100 and 1 <= minimum < maximum <= 5, 422,
                            "Criterion scores must fit the 1–5 judging scale")
                    codes.add(code)
                    conn.execute("INSERT INTO criteria VALUES(?,?,?,?,?,?,?,?)",
                                 (uid("cri"), rubric_id, code, label, weight, minimum, maximum, pos))
                audit(conn, "rubric_activate", user["id"], event_id, rubric_id, "version=" + str(version))
                self.send_json(201, {"id": rubric_id, "version": version})
                return
            if len(parts) == 4 and parts[3] == "assignments" and method == "GET":
                self.must_role(conn, user, event_id, "organizer")
                rows = conn.execute("""SELECT a.*,p.title project_title,u.name judge_name,
                    r.status review_status FROM assignments a JOIN projects p ON p.id=a.project_id
                    JOIN users u ON u.id=a.judge_user_id LEFT JOIN reviews r ON r.assignment_id=a.id
                    WHERE a.event_id=? ORDER BY p.title""", (event_id,)).fetchall()
                self.send_json(200, {"assignments": [dict(r) for r in rows]})
                return
            if len(parts) == 4 and parts[3] == "judges" and method == "GET":
                self.must_role(conn, user, event_id, "organizer")
                rows = conn.execute("""SELECT u.id,u.name,u.email FROM users u JOIN event_roles er
                    ON er.user_id=u.id WHERE er.event_id=? AND er.role='judge' ORDER BY u.name""",
                    (event_id,)).fetchall()
                self.send_json(200, {"judges": [{**dict(r), "track_ids": judge_track_scope(conn, event_id, r["id"])} for r in rows]})
                return
            if len(parts) == 4 and parts[3] == "assignments" and method == "POST":
                self.must_role(conn, user, event_id, "organizer")
                require(event["published_at"] is None, 409, "Published results cannot change")
                require(not event["judging_close"] or now() < parse_time(event["judging_close"]), 409,
                        "Judging deadline has passed")
                body = self.body_json()
                project_id = clean(body.get("project_id", ""), 100)
                judge_id = clean(body.get("judge_user_id", ""), 100)
                project = conn.execute("SELECT * FROM projects WHERE id=? AND event_id=? AND status='submitted'",
                                       (project_id, event_id)).fetchone()
                require(project is not None, 404, "Submitted project not found")
                require(role(conn, conn.execute("SELECT * FROM users WHERE id=?", (judge_id,)).fetchone(), event_id, "judge"),
                        422, "User is not a judge for this event")
                require(judge_can_review(conn, judge_id, event_id, project["track_id"]),
                        422, "Judge is not permitted to review this track")
                require(not is_team_member(conn, conn.execute("SELECT * FROM users WHERE id=?", (judge_id,)).fetchone(),
                                           project["team_id"]), 409, "Judge conflicts with project team")
                assignment_id = uid("asn")
                conn.execute("INSERT INTO assignments VALUES(?,?,?,?,?,?)",
                             (assignment_id, event_id, project_id, judge_id, "manual", iso()))
                audit(conn, "judge_assign", user["id"], event_id, assignment_id)
                self.send_json(201, {"id": assignment_id})
                return
            if len(parts) == 5 and parts[3:] == ["assignments", "batch"] and method == "POST":
                self.must_role(conn, user, event_id, "organizer")
                require(not event["published_at"], 409, "Published results cannot change")
                require(not event["judging_close"] or now() < parse_time(event["judging_close"]),
                        409, "Judging deadline has passed")
                target = self.body_json().get("reviews_per_project", 3)
                require(type(target) is int and 1 <= target <= 10, 422, "Choose one to ten reviews per project")
                conn.execute("BEGIN IMMEDIATE")
                judges = conn.execute("""SELECT u.* FROM users u JOIN event_roles er ON er.user_id=u.id
                    WHERE er.event_id=? AND er.role='judge' ORDER BY u.id""", (event_id,)).fetchall()
                workloads = {j["id"]: conn.execute("SELECT COUNT(*) FROM assignments WHERE event_id=? AND judge_user_id=?",
                             (event_id, j["id"])).fetchone()[0] for j in judges}
                projects = conn.execute("""SELECT * FROM projects WHERE event_id=? AND status='submitted'
                    AND duplicate_of IS NULL ORDER BY id""", (event_id,)).fetchall()
                created, shortfalls = [], []
                batch = uid("batch")
                for project in projects:
                    existing = {r[0] for r in conn.execute("SELECT judge_user_id FROM assignments WHERE project_id=?", (project["id"],))}
                    eligible = sorted((j for j in judges if j["id"] not in existing and
                        judge_can_review(conn, j["id"], event_id, project["track_id"]) and
                        not is_team_member(conn, j, project["team_id"])), key=lambda j: (workloads[j["id"]], j["id"]))
                    for judge in eligible[:max(0, target-len(existing))]:
                        assignment_id = uid("asn")
                        conn.execute("INSERT INTO assignments VALUES(?,?,?,?,?,?)",
                                     (assignment_id, event_id, project["id"], judge["id"], batch, iso()))
                        workloads[judge["id"]] += 1
                        existing.add(judge["id"])
                        created.append(assignment_id)
                    if len(existing) < target:
                        shortfalls.append({"project_id": project["id"], "title": project["title"], "missing": target-len(existing)})
                audit(conn, "judge_batch_assign", user["id"], event_id, batch, json.dumps({"created": len(created), "shortfalls": shortfalls}))
                self.send_json(201, {"batch": batch, "created": len(created), "shortfalls": shortfalls})
                return
            if len(parts) == 4 and parts[3] == "progress" and method == "GET":
                self.must_role(conn, user, event_id, "organizer")
                rows = conn.execute("""SELECT u.id judge_user_id,u.name judge_name,
                    COUNT(a.id) assigned,SUM(CASE WHEN r.status='submitted' THEN 1 ELSE 0 END) completed
                    FROM event_roles er JOIN users u ON u.id=er.user_id
                    LEFT JOIN assignments a ON a.judge_user_id=u.id AND a.event_id=er.event_id
                    LEFT JOIN reviews r ON r.assignment_id=a.id
                    WHERE er.event_id=? AND er.role='judge' GROUP BY u.id ORDER BY u.name""", (event_id,)).fetchall()
                judges = [{**dict(r), "pending": r["assigned"] - r["completed"],
                           "percent": round(100 * r["completed"] / r["assigned"], 1) if r["assigned"] else 0} for r in rows]
                assigned = sum(r["assigned"] for r in rows)
                completed = sum(r["completed"] for r in rows)
                self.send_json(200, {"assigned": assigned, "completed": completed, "pending": assigned-completed,
                                     "percent": round(100 * completed / assigned, 1) if assigned else 0,
                                     "judges": judges})
                return
            if len(parts) == 4 and parts[3] == "reviews" and method == "GET":
                self.must_role(conn, user, event_id, "organizer")
                rows = conn.execute("""SELECT a.id assignment_id,p.id project_id,p.title project_title,
                    u.id judge_user_id,u.name judge_name,r.id review_id,r.status review_status,
                    r.comment,r.submitted_at,r.rubric_id
                    FROM assignments a JOIN projects p ON p.id=a.project_id
                    JOIN users u ON u.id=a.judge_user_id
                    LEFT JOIN reviews r ON r.assignment_id=a.id
                    WHERE a.event_id=? ORDER BY p.title,u.name""", (event_id,)).fetchall()
                output = []
                for row in rows:
                    item = dict(row)
                    criteria = conn.execute("""SELECT c.code,c.label,c.weight,cs.value
                        FROM criterion_scores cs JOIN criteria c ON c.id=cs.criterion_id
                        WHERE cs.review_id=? ORDER BY c.position""", (row["review_id"],)).fetchall() \
                        if row["review_id"] else []
                    item["scores"] = [dict(c) for c in criteria]
                    item["raw_score"] = round(sum(c["weight"] * c["value"] for c in criteria) /
                                              sum(c["weight"] for c in criteria), 4) if criteria else None
                    output.append(item)
                self.send_json(200, {"reviews": output})
                return
            if len(parts) == 4 and parts[3] == "results" and method == "GET":
                require(can_manage(conn, user, event_id) or event["published_at"] is not None,
                        403, "Results are not published")
                if event["published_at"]:
                    rows = [dict(r) for r in conn.execute("""SELECT s.*,p.title,p.track_id,p.duplicate_of
                        FROM result_snapshots s JOIN projects p ON p.id=s.project_id
                        WHERE s.event_id=? ORDER BY p.track_id,s.adjusted_score DESC,p.id""",
                        (event_id,)).fetchall()]
                else:
                    rows = calculate_results(conn, event_id)
                self.send_json(200, {"published": bool(event["published_at"]), "results": rows})
                return
            if len(parts) == 4 and parts[3] == "community-results" and method == "GET":
                voting_ended = bool(event["voting_close"] and now() >= parse_time(event["voting_close"]))
                require(event["published_at"] is not None or
                        (can_manage(conn, user, event_id) and voting_ended),
                        403, "Community results are hidden until voting closes and results are published")
                rows = conn.execute("""SELECT p.id project_id,p.title,COUNT(v.id) votes
                    FROM projects p LEFT JOIN votes v ON v.project_id=p.id AND v.event_id=p.event_id
                    WHERE p.event_id=? AND p.status='submitted' AND p.duplicate_of IS NULL
                    GROUP BY p.id ORDER BY votes DESC,p.title""", (event_id,)).fetchall()
                self.send_json(200, {"published": bool(event["published_at"]),
                                     "results": [dict(row) for row in rows]})
                return
            if len(parts) == 4 and parts[3] == "publish" and method == "POST":
                self.must_role(conn, user, event_id, "organizer")
                require(event["published_at"] is None, 409, "Results are already published")
                require(now() >= parse_time(event["submissions_close"]), 409,
                        "Close submissions before publishing")
                require((event["status"] != "voting" or
                         (event["voting_close"] and now() >= parse_time(event["voting_close"]))) and
                        (not event["voting_close"] or now() >= parse_time(event["voting_close"])),
                        409, "Voting must close before publishing")
                results = calculate_results(conn, event_id)
                published_at = iso()
                conn.execute("DELETE FROM result_snapshots WHERE event_id=?", (event_id,))
                for result in results:
                    conn.execute("INSERT INTO result_snapshots VALUES(?,?,?,?,?,?,?)",
                                 (event_id, result["project_id"], result["raw_score"], result["adjusted_score"],
                                  result["review_count"], "judge-mean-shrinkage-v1", published_at))
                conn.execute("UPDATE events SET status='published',published_at=? WHERE id=?", (published_at,event_id))
                issue_event_records(conn, event_id, published_at)
                audit(conn, "results_publish", user["id"], event_id, detail=str(len(results)) + " projects")
                self.send_json(200, {"published_at": published_at, "count": len(results)})
                return
            if len(parts) == 4 and parts[3] == "records" and method == "GET":
                self.must_role(conn, user, event_id, "organizer")
                rows = conn.execute("""SELECT id,kind,subject_id,payload_json,signature,issued_at
                    FROM issued_records WHERE event_id=? ORDER BY kind,issued_at,subject_id""",
                    (event_id,)).fetchall()
                self.send_json(200, {"records": [{"id": r["id"], "kind": r["kind"],
                    "subject_id": r["subject_id"], "payload": json.loads(r["payload_json"]),
                    "signature": r["signature"], "issued_at": r["issued_at"]} for r in rows]})
                return
            if len(parts) == 4 and parts[3] == "my-records" and method == "GET":
                self.must_user(user)
                rows = conn.execute("""SELECT r.id,r.kind,r.payload_json,r.signature,r.issued_at
                    FROM issued_records r LEFT JOIN projects p ON r.kind='project' AND r.subject_id=p.id
                    LEFT JOIN team_members tm ON tm.team_id=p.team_id AND tm.user_id=?
                    WHERE r.event_id=? AND ((r.kind='judge' AND r.subject_id=?) OR
                    (r.kind='project' AND tm.user_id IS NOT NULL)) ORDER BY r.kind""",
                    (user["id"], event_id, user["id"])).fetchall()
                self.send_json(200, {"records": [{"id": r["id"], "kind": r["kind"],
                    "payload": json.loads(r["payload_json"]), "signature": r["signature"],
                    "issued_at": r["issued_at"]} for r in rows]})
                return
            if len(parts) == 4 and parts[3] == "export.csv" and method == "GET":
                self.must_role(conn, user, event_id, "organizer")
                output = io.StringIO()
                writer = csv.writer(output)
                writer.writerow(["project_id", "title", "track_id", "duplicate_of", "review_count",
                                 "raw_score", "adjusted_score", "method"])
                results = [dict(r) for r in conn.execute("""SELECT s.*,p.title,p.track_id,p.duplicate_of
                    FROM result_snapshots s JOIN projects p ON p.id=s.project_id WHERE s.event_id=?
                    ORDER BY p.track_id,s.adjusted_score DESC,p.id""", (event_id,)).fetchall()] \
                    if event["published_at"] else calculate_results(conn, event_id)
                for r in results:
                    writer.writerow([csv_safe(r["project_id"]), csv_safe(r["title"]), csv_safe(r["track_id"]),
                                     csv_safe(r["duplicate_of"]), r["review_count"], r["raw_score"],
                                     r["adjusted_score"], r.get("method", "judge-mean-shrinkage-v1")])
                self.send_bytes(200, output.getvalue().encode("utf-8"), "text/csv; charset=utf-8",
                                {"Content-Disposition": "attachment; filename=dogfood-results.csv"})
                return
            if len(parts) == 4 and parts[3] == "export.json" and method == "GET":
                self.must_role(conn, user, event_id, "organizer")
                direct = ("tracks", "prizes", "teams", "projects", "rubrics", "assignments",
                          "result_snapshots", "votes", "audit_events", "issued_records", "event_roles",
                          "event_questions", "judge_track_scopes", "archive_provenance", "voting_policies", "voter_access")
                archive = {"schema": "dogfood-event-v1", "exported_at": iso(), "event": dict(event)}
                for table in direct:
                    archive[table] = [dict(row) for row in conn.execute(
                        "SELECT * FROM " + table + " WHERE event_id=?", (event_id,)).fetchall()]
                nested = {
                    "team_members": "SELECT tm.* FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE t.event_id=?",
                    "criteria": "SELECT c.* FROM criteria c JOIN rubrics r ON r.id=c.rubric_id WHERE r.event_id=?",
                    "reviews": "SELECT r.* FROM reviews r JOIN assignments a ON a.id=r.assignment_id WHERE a.event_id=?",
                    "criterion_scores": """SELECT cs.* FROM criterion_scores cs JOIN reviews r ON r.id=cs.review_id
                        JOIN assignments a ON a.id=r.assignment_id WHERE a.event_id=?""",
                    "comments": "SELECT c.* FROM comments c JOIN projects p ON p.id=c.project_id WHERE p.event_id=?",
                    "project_details": """SELECT d.* FROM project_details d JOIN projects p ON p.id=d.project_id
                        WHERE p.event_id=?""",
                }
                for table, statement in nested.items():
                    archive[table] = [dict(row) for row in conn.execute(statement, (event_id,)).fetchall()]
                archive["users"] = [dict(row) for row in conn.execute("""SELECT DISTINCT u.id,u.email,u.name
                    FROM users u WHERE u.id IN (
                    SELECT user_id FROM event_roles WHERE event_id=? UNION
                    SELECT tm.user_id FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE t.event_id=? UNION
                    SELECT judge_user_id FROM assignments WHERE event_id=? UNION
                    SELECT user_id FROM votes WHERE event_id=? UNION
                    SELECT c.user_id FROM comments c JOIN projects p ON p.id=c.project_id WHERE p.event_id=? UNION
                    SELECT user_id FROM voter_access WHERE event_id=?) ORDER BY u.id""",
                    (event_id, event_id, event_id, event_id, event_id, event_id)).fetchall()]
                self.send_bytes(200, json.dumps(archive, ensure_ascii=False, default=str).encode("utf-8"),
                                "application/json; charset=utf-8",
                                {"Content-Disposition": "attachment; filename=dogfood-event.json"})
                return
            if len(parts) == 4 and parts[3] == "import.json" and method == "POST":
                self.must_role(conn, user, event_id, "organizer")
                require(event["published_at"] is None, 409, "Published event cannot be imported into")
                body = self.body_json()
                if body.get("schema") == "dogfood-event-v1":
                    self.send_json(201, restore_archive(conn, event_id, body, user))
                    return
                teams = body.get("teams", [])
                projects = body.get("projects", [])
                require(isinstance(teams, list) and isinstance(projects, list) and
                        len(teams) <= 200 and len(projects) <= 500 and (teams or projects), 422,
                        "Supply at most 200 teams and 500 projects")
                existing_teams = conn.execute("SELECT id,name FROM teams WHERE event_id=?", (event_id,)).fetchall()
                team_ids = {item["name"].casefold(): item["id"] for item in existing_teams}
                source_emails = {str(item.get("id")): str(item.get("email", ""))
                                 for item in body.get("users", []) if isinstance(item, dict)}
                source_members = {}
                for item in body.get("team_members", []):
                    if isinstance(item, dict):
                        email = source_emails.get(str(item.get("user_id")))
                        if email:
                            source_members.setdefault(str(item.get("team_id")), []).append(email)
                source_team_ids = {}
                imported_teams = 0
                imported_members = 0
                skipped_members = 0
                imported_projects = 0
                for team in teams:
                    require(isinstance(team, dict), 422, "Invalid team row")
                    name = clean(team.get("name", ""), 120)
                    require(name, 422, "Team name required")
                    if name.casefold() not in team_ids:
                        team_id = uid("tm")
                        creator_email = source_emails.get(str(team.get("created_by")), "")
                        creator = user_by_email(conn, creator_email) if creator_email else None
                        conn.execute("INSERT INTO teams VALUES(?,?,?,?,?)",
                                     (team_id, event_id, name, creator["id"] if creator else user["id"], iso()))
                        team_ids[name.casefold()] = team_id
                        imported_teams += 1
                    if team.get("id"):
                        source_team_ids[str(team["id"]).casefold()] = team_ids[name.casefold()]
                    explicit_members = team.get("members", [])
                    require(isinstance(explicit_members, list), 422, "Invalid team member list")
                    members = list(dict.fromkeys([*explicit_members,
                                                  *source_members.get(str(team.get("id")), [])]))
                    require(isinstance(members, list) and len(members) <= 4, 422,
                            "Each team may list up to four existing member emails")
                    for email in members:
                        account = user_by_email(conn, clean(email, 200))
                        if account is None and email not in explicit_members:
                            skipped_members += 1
                            continue
                        require(account is not None, 422, "Team member account must exist")
                        conflict = conn.execute("""SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id
                            WHERE t.event_id=? AND tm.user_id=? AND tm.team_id<>?""",
                            (event_id, account["id"], team_ids[name.casefold()])).fetchone()
                        require(conflict is None, 409, "Member already belongs to another team")
                        already_member = conn.execute("SELECT 1 FROM team_members WHERE team_id=? AND user_id=?",
                                                      (team_ids[name.casefold()], account["id"])).fetchone()
                        if not already_member:
                            member_count = conn.execute("SELECT COUNT(*) FROM team_members WHERE team_id=?",
                                                        (team_ids[name.casefold()],)).fetchone()[0]
                            require(member_count < 4, 409, "Team is full")
                        inserted = conn.execute("INSERT OR IGNORE INTO team_members VALUES(?,?,?)",
                                                (team_ids[name.casefold()], account["id"], iso()))
                        imported_members += inserted.rowcount
                        conn.execute("INSERT OR IGNORE INTO event_roles VALUES(?,?,?)",
                                     (event_id, account["id"], "participant"))
                tracks = conn.execute("SELECT id,name FROM tracks WHERE event_id=?", (event_id,)).fetchall()
                track_ids = {item["name"].casefold(): item["id"] for item in tracks}
                track_ids.update({item["id"].casefold(): item["id"] for item in tracks})
                imported_tracks = 0
                for source_track in body.get("tracks", []):
                    require(isinstance(source_track, dict), 422, "Invalid track row")
                    track_name = clean(source_track.get("name", ""), 120)
                    require(track_name, 422, "Track name required")
                    target = track_ids.get(track_name.casefold())
                    if target is None:
                        target = uid("trk")
                        conn.execute("INSERT INTO tracks VALUES(?,?,?)", (target, event_id, track_name))
                        track_ids[track_name.casefold()] = target
                        imported_tracks += 1
                    if source_track.get("id"):
                        track_ids[str(source_track["id"]).casefold()] = target
                imported_prizes = 0
                prize_names = {row["title"].casefold() for row in conn.execute(
                    "SELECT title FROM prizes WHERE event_id=?", (event_id,))}
                for source_prize in body.get("prizes", []):
                    require(isinstance(source_prize, dict), 422, "Invalid prize row")
                    prize_title = clean(source_prize.get("title", ""), 160)
                    require(prize_title, 422, "Prize title required")
                    if prize_title.casefold() not in prize_names:
                        conn.execute("INSERT INTO prizes VALUES(?,?,?,?)", (uid("prz"), event_id,
                                     prize_title, clean(source_prize.get("description", ""), 1000)))
                        prize_names.add(prize_title.casefold())
                        imported_prizes += 1
                for project in projects:
                    require(isinstance(project, dict), 422, "Invalid project row")
                    team_name = clean(project.get("team") or project.get("team_id") or "", 120).casefold()
                    track_name = clean(project.get("track") or project.get("track_id") or "", 120).casefold()
                    title = clean(project.get("title", ""), 160)
                    team_id = source_team_ids.get(team_name) or team_ids.get(team_name)
                    require(team_id and track_name in track_ids and title, 422,
                            "Each project needs an existing team, track and title")
                    previous = conn.execute("""SELECT id,title FROM projects WHERE event_id=? AND team_id=?
                        AND source_fixture_id IS NULL""", (event_id, team_id)).fetchone()
                    require(previous is None or previous["title"].casefold() == title.casefold(), 409,
                            "Team already has a different project")
                    if previous:
                        continue
                    submitted_at = clean(project.get("submitted_at") or iso(), 60)
                    submitted_at = iso(parse_time(submitted_at))
                    imported_id = uid("prj")
                    conn.execute("""INSERT INTO projects
                        (id,event_id,team_id,track_id,title,summary,repo_url,status,submitted_at,created_at,updated_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                        (imported_id, event_id, team_id, track_ids[track_name], title,
                         clean(project.get("summary", ""), 4000), repo_url(project.get("repo_url", "")),
                         "submitted", submitted_at, iso(), iso()))
                    details = next((item for item in body.get("project_details", [])
                                    if isinstance(item, dict) and item.get("project_id") == project.get("id")), None)
                    if details:
                        save_project_details(conn, imported_id, {**details,
                            "image_urls": json.loads(details.get("image_urls", "[]")),
                            "tech_tags": json.loads(details.get("tech_tags", "[]")),
                            "custom_answers": json.loads(details.get("custom_answers", "{}"))})
                    else:
                        save_project_details(conn, imported_id, project)
                    imported_projects += 1
                audit(conn, "bulk_import", user["id"], event_id,
                      detail=f"{imported_teams} teams, {imported_projects} projects")
                self.send_json(201, {"teams_created": imported_teams,
                                     "members_added": imported_members,
                                     "members_skipped": skipped_members,
                                     "tracks_created": imported_tracks,
                                     "prizes_created": imported_prizes,
                                     "projects_created": imported_projects})
                return
            if len(parts) == 4 and parts[3] == "webhooks":
                self.must_role(conn, user, event_id, "organizer")
                if method == "GET":
                    rows = conn.execute("""SELECT id,url,active,created_at FROM webhooks
                        WHERE event_id=? ORDER BY created_at DESC""", (event_id,)).fetchall()
                    self.send_json(200, {"webhooks": [dict(r) for r in rows]})
                    return
                if method == "POST":
                    url = clean(self.body_json().get("url", ""), 500)
                    parsed_url = urlsplit(url)
                    loopback = parsed_url.hostname in {"localhost", "127.0.0.1", "::1"}
                    require(parsed_url.scheme == "https" or
                            (parsed_url.scheme == "http" and loopback), 422,
                            "Webhook URL must use HTTPS, or HTTP on loopback")
                    require(parsed_url.netloc and not parsed_url.username and not parsed_url.password and
                            not parsed_url.fragment, 422, "Invalid webhook URL")
                    hook_id = uid("wh")
                    secret = secrets.token_hex(32)
                    conn.execute("INSERT INTO webhooks VALUES(?,?,?,?,?,?)",
                                 (hook_id, event_id, url, secret, 1, iso()))
                    audit(conn, "webhook_create", user["id"], event_id, hook_id)
                    self.send_json(201, {"id": hook_id, "url": url, "secret": secret,
                                         "note": "Copy the secret now; it is not shown again."})
                    return
            if len(parts) == 5 and parts[3] == "webhooks" and parts[4] == "deliveries" and method == "GET":
                self.must_role(conn, user, event_id, "organizer")
                rows = conn.execute("""SELECT d.id,d.webhook_id,d.action,d.attempts,d.delivered_at,
                    d.last_error,d.created_at FROM webhook_deliveries d
                    WHERE d.event_id=? ORDER BY d.created_at DESC,d.id DESC LIMIT 200""",
                    (event_id,)).fetchall()
                self.send_json(200, {"deliveries": [dict(r) for r in rows]})
                return
            if len(parts) == 6 and parts[3:5] == ["webhooks", "deliveries"] and parts[5] == "retry" and method == "POST":
                self.must_role(conn, user, event_id, "organizer")
                conn.execute("""UPDATE webhook_deliveries SET attempts=0,last_error=''
                    WHERE event_id=? AND delivered_at IS NULL""", (event_id,))
                self.send_json(200, {"queued": True})
                return
            if len(parts) == 5 and parts[3] == "webhooks" and method in ("PATCH", "DELETE"):
                self.must_role(conn, user, event_id, "organizer")
                hook = conn.execute("SELECT id FROM webhooks WHERE id=? AND event_id=?",
                                    (parts[4], event_id)).fetchone()
                require(hook is not None, 404, "Webhook not found")
                active = bool(self.body_json().get("active")) if method == "PATCH" else False
                conn.execute("UPDATE webhooks SET active=? WHERE id=?", (int(active), hook["id"]))
                audit(conn, "webhook_enable" if active else "webhook_disable", user["id"], event_id, hook["id"])
                self.send_json(200, {"id": hook["id"], "active": active})
                return
            if len(parts) == 4 and parts[3] == "audit" and method == "GET":
                self.must_role(conn, user, event_id, "organizer")
                rows = conn.execute("SELECT * FROM audit_events WHERE event_id=? ORDER BY id DESC LIMIT 300",
                                    (event_id,)).fetchall()
                self.send_json(200, {"events": [dict(r) for r in rows]})
                return
        self.api_resource(conn, user, method, parts, query)

    def api_resource(self, conn: sqlite3.Connection, user: sqlite3.Row | None,
                     method: str, parts: list[str], query: dict) -> None:
        if len(parts) == 4 and parts[:2] == ["api", "voter-invites"] and parts[3] == "accept" and method == "POST":
            self.must_user(user)
            conn.execute("BEGIN IMMEDIATE")
            invite = conn.execute("SELECT * FROM voter_invites WHERE token_hash=?", (token_hash(parts[2]),)).fetchone()
            require(invite is not None and not invite["accepted_at"] and parse_time(invite["expires_at"]) > now(),
                    404, "Voter invitation is invalid, expired, or already used")
            require(user["email"].lower() == invite["email"], 403, "Sign in with the invited email address")
            event = event_row(conn, invite["event_id"])
            require(not event["published_at"] and (not event["voting_close"] or now() < parse_time(event["voting_close"])),
                    409, "Voting is closed")
            conn.execute("INSERT OR IGNORE INTO voter_access VALUES(?,?,?)", (event["id"], user["id"], iso()))
            conn.execute("UPDATE voter_invites SET accepted_at=? WHERE token_hash=?", (iso(), invite["token_hash"]))
            audit(conn, "voter_invite_accept", user["id"], event["id"])
            self.send_json(200, {"event_id": event["id"], "eligible": True})
            return
        if len(parts) == 4 and parts[:2] == ["api", "role-invites"] and parts[3] == "accept" and method == "POST":
            self.must_user(user)
            invitation = conn.execute("SELECT * FROM role_invites WHERE token_hash=?",
                                      (token_hash(parts[2]),)).fetchone()
            require(invitation is not None and invitation["accepted_at"] is None and
                    parse_time(invitation["expires_at"]) > now(), 404, "Invitation expired or invalid")
            require(user["email"].lower() == invitation["email"], 403,
                    "Sign in with the invited email address")
            conn.execute("INSERT OR IGNORE INTO event_roles VALUES(?,?,?)",
                         (invitation["event_id"], user["id"], invitation["role"]))
            scope = conn.execute("SELECT track_ids FROM role_invite_scopes WHERE token_hash=?",
                                 (invitation["token_hash"],)).fetchone()
            if invitation["role"] == "judge" and scope:
                conn.execute("INSERT OR REPLACE INTO judge_track_scopes VALUES(?,?,?)",
                             (invitation["event_id"], user["id"], scope[0]))
            conn.execute("UPDATE role_invites SET accepted_at=? WHERE token_hash=?",
                         (iso(), invitation["token_hash"]))
            audit(conn, "role_invite_accept", user["id"], invitation["event_id"], detail=invitation["role"])
            self.send_json(200, {"event_id": invitation["event_id"], "role": invitation["role"]})
            return
        if len(parts) == 4 and parts[:2] == ["api", "judges"] and parts[3] == "scores" and method == "GET":
            self.must_user(user)
            judge_id = parts[2]
            if user["id"] != judge_id:
                audit(conn, "peer_score_denied", user["id"], target=judge_id)
                conn.commit()
                raise ApiError(403, "Judge scores are private")
            require(conn.execute("SELECT 1 FROM event_roles WHERE user_id=? AND role='judge'", (judge_id,)).fetchone() is not None,
                    403, "Judge role required")
            rows = conn.execute("""SELECT a.id assignment_id,a.event_id,a.project_id,p.title project_title,p.track_id,
                r.id review_id,r.status review_status,r.comment,r.submitted_at
                FROM assignments a JOIN projects p ON p.id=a.project_id
                LEFT JOIN reviews r ON r.assignment_id=a.id WHERE a.judge_user_id=?
                ORDER BY a.event_id,p.title""", (judge_id,)).fetchall()
            output = []
            for row in rows:
                if not judge_can_review(conn, judge_id, row["event_id"], row["track_id"]):
                    continue
                item = dict(row)
                review_rubric = conn.execute("SELECT rubric_id FROM reviews WHERE id=?",
                                             (row["review_id"],)).fetchone() if row["review_id"] else None
                rubric = conn.execute("SELECT id FROM rubrics WHERE id=?", (review_rubric["rubric_id"],)).fetchone() \
                    if review_rubric else active_rubric(conn, row["event_id"])
                item["criteria"] = [dict(c) for c in rubric_criteria(conn, rubric["id"])]
                item["scores"] = {s["code"]: s["value"] for s in conn.execute("""SELECT c.code,cs.value
                    FROM criterion_scores cs JOIN criteria c ON c.id=cs.criterion_id
                    WHERE cs.review_id=?""", (row["review_id"],)).fetchall()} if row["review_id"] else {}
                output.append(item)
            self.send_json(200, {"judge_id": judge_id, "assignments": output})
            return
        if len(parts) == 4 and parts[:2] == ["api", "teams"] and parts[3] == "invites" and method == "POST":
            self.must_user(user)
            team = conn.execute("SELECT * FROM teams WHERE id=?", (parts[2],)).fetchone()
            require(team is not None, 404, "Team not found")
            require_submission_open(event_row(conn, team["event_id"]))
            require(team["created_by"] == user["id"] or can_manage(conn, user, team["event_id"]),
                    403, "Only team creator or organizer may invite")
            token = secrets.token_urlsafe(32)
            conn.execute("INSERT INTO team_invites VALUES(?,?,?,?,?,?,?)",
                         (token_hash(token), team["id"], iso(now() + timedelta(days=2)), 3, 0, 0, user["id"]))
            audit(conn, "team_invite_create", user["id"], team["event_id"], team["id"])
            self.send_json(201, {"invite_path": "/join/" + token, "token": token})
            return
        if len(parts) == 4 and parts[:2] == ["api", "invites"] and parts[3] == "accept" and method == "POST":
            self.must_user(user)
            invitation = conn.execute("""SELECT i.*,t.event_id FROM team_invites i
                JOIN teams t ON t.id=i.team_id WHERE i.token_hash=?""", (token_hash(parts[2]),)).fetchone()
            require(invitation is not None and not invitation["revoked"] and
                    parse_time(invitation["expires_at"]) > now() and invitation["uses"] < invitation["max_uses"],
                    404, "Invite expired or invalid")
            require_submission_open(event_row(conn, invitation["event_id"]))
            already = conn.execute("""SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id
                WHERE t.event_id=? AND tm.user_id=?""", (invitation["event_id"], user["id"])).fetchone()
            require(not already, 409, "Already in an event team")
            assigned = conn.execute("""SELECT 1 FROM assignments a JOIN projects p ON p.id=a.project_id
                WHERE a.judge_user_id=? AND p.team_id=? LIMIT 1""",
                (user["id"], invitation["team_id"])).fetchone()
            require(not assigned, 409, "Judge cannot join a team they are assigned to review")
            count = conn.execute("SELECT COUNT(*) FROM team_members WHERE team_id=?", (invitation["team_id"],)).fetchone()[0]
            require(count < 4, 409, "Team is full")
            conn.execute("INSERT INTO team_members VALUES(?,?,?)", (invitation["team_id"], user["id"], iso()))
            conn.execute("UPDATE team_invites SET uses=uses+1 WHERE token_hash=?", (invitation["token_hash"],))
            conn.execute("INSERT OR IGNORE INTO event_roles VALUES(?,?,?)", (invitation["event_id"], user["id"], "participant"))
            audit(conn, "team_invite_accept", user["id"], invitation["event_id"], invitation["team_id"])
            self.send_json(200, {"team_id": invitation["team_id"]})
            return
        if len(parts) >= 3 and parts[:2] == ["api", "projects"]:
            project = conn.execute("SELECT * FROM projects WHERE id=?", (parts[2],)).fetchone()
            require(project is not None, 404, "Project not found")
            if len(parts) == 3 and method == "GET":
                require(project["status"] == "submitted" or is_team_member(conn, user, project["team_id"]) or
                        can_manage(conn, user, project["event_id"]), 403, "Private draft")
                self.send_json(200, {"project": project_payload(conn, project)})
                return
            if len(parts) == 3 and method == "PATCH":
                self.must_user(user)
                require_submission_open(event_row(conn, project["event_id"]))
                require(is_team_member(conn, user, project["team_id"]), 403, "Not a team member")
                body = self.body_json()
                allowed = {"title": 150, "summary": 3000, "repo_url": 500, "track_id": 100}
                updates = {k: clean(body[k], limit) for k, limit in allowed.items() if k in body}
                if "repo_url" in updates:
                    updates["repo_url"] = repo_url(updates["repo_url"])
                require(updates or {"tagline", "description", "thumbnail_url", "demo_url", "live_url",
                                    "image_urls", "tech_tags", "custom_answers"}.intersection(body),
                        422, "No changes supplied")
                if "track_id" in updates:
                    require(conn.execute("SELECT 1 FROM tracks WHERE id=? AND event_id=?",
                                         (updates["track_id"], project["event_id"])).fetchone() is not None,
                            422, "Invalid track")
                if "title" in updates:
                    require(updates["title"], 422, "Title required")
                updates["updated_at"] = iso()
                conn.execute("UPDATE projects SET " + ",".join(k + "=?" for k in updates) + " WHERE id=?",
                             [*updates.values(), project["id"]])
                save_project_details(conn, project["id"], body)
                if project["status"] == "submitted":
                    validate_project_answers(conn, project["id"])
                audit(conn, "project_edit", user["id"], project["event_id"], project["id"], ",".join(updates))
                self.send_json(200, {"ok": True})
                return
            if len(parts) == 4 and parts[3] == "submit" and method == "POST":
                self.must_user(user)
                require_submission_open(event_row(conn, project["event_id"]))
                require(is_team_member(conn, user, project["team_id"]), 403, "Not a team member")
                validate_project_answers(conn, project["id"])
                conn.execute("UPDATE projects SET status='submitted',submitted_at=?,updated_at=? WHERE id=?",
                             (iso(), iso(), project["id"]))
                audit(conn, "project_submit", user["id"], project["event_id"], project["id"])
                self.send_json(200, {"status": "submitted"})
                return
            if len(parts) == 4 and parts[3] == "comments":
                require(project["status"] == "submitted", 403, "Draft has no public comments")
                if method == "GET":
                    rows = conn.execute("""SELECT c.id,c.body,c.created_at,u.name author
                        FROM comments c JOIN users u ON u.id=c.user_id
                        WHERE c.project_id=? AND c.status='visible' ORDER BY c.created_at""",
                        (project["id"],)).fetchall()
                    self.send_json(200, {"comments": [dict(r) for r in rows]})
                    return
                if method == "POST":
                    self.must_user(user)
                    body = clean(self.body_json().get("body", ""), 1000)
                    require(2 <= len(body), 422, "Comment is too short")
                    conn.execute("BEGIN IMMEDIATE")  # Serialize duplicate and rate checks with insert.
                    normalized = re.sub(r"\s+", " ", body).casefold()
                    previous = conn.execute("""SELECT body FROM comments
                        WHERE project_id=? AND user_id=? AND status='visible'""",
                        (project["id"], user["id"])).fetchall()
                    if any(re.sub(r"\s+", " ", row["body"]).casefold() == normalized for row in previous):
                        audit(conn, "comment_duplicate_blocked", user["id"], project["event_id"], project["id"])
                        conn.commit()
                        raise ApiError(409, "You already posted this comment")
                    recent = conn.execute("SELECT COUNT(*) FROM comments WHERE user_id=? AND created_at>?",
                                          (user["id"], iso(now()-timedelta(minutes=1)))).fetchone()[0]
                    if recent >= 5:
                        audit(conn, "comment_rate_limited", user["id"], project["event_id"], project["id"])
                        conn.commit()
                        raise ApiError(429, "Comment rate limit")
                    comment_id = uid("cmt")
                    conn.execute("INSERT INTO comments VALUES(?,?,?,?,?,?)",
                                 (comment_id, project["id"], user["id"], body, "visible", iso()))
                    audit(conn, "comment_create", user["id"], project["event_id"], comment_id)
                    self.send_json(201, {"id": comment_id})
                    return
        if len(parts) == 3 and parts[:2] == ["api", "comments"] and method == "PATCH":
            comment = conn.execute("""SELECT c.*,p.event_id FROM comments c
                JOIN projects p ON p.id=c.project_id WHERE c.id=?""", (parts[2],)).fetchone()
            require(comment is not None, 404, "Comment not found")
            self.must_role(conn, user, comment["event_id"], "organizer")
            status = clean(self.body_json().get("status", ""), 20)
            require(status in {"visible", "hidden"}, 422, "Invalid comment status")
            conn.execute("UPDATE comments SET status=? WHERE id=?", (status, comment["id"]))
            audit(conn, "comment_moderate", user["id"], comment["event_id"], comment["id"], status)
            self.send_json(200, {"id": comment["id"], "status": status})
            return
        if len(parts) == 4 and parts[:2] == ["api", "assignments"] and parts[3] == "review" and method == "PUT":
            self.must_user(user)
            assignment = conn.execute("SELECT * FROM assignments WHERE id=?", (parts[2],)).fetchone()
            require(assignment is not None, 404, "Assignment not found")
            require(assignment["judge_user_id"] == user["id"], 403,
                    "Review belongs to another judge")
            require(role(conn, user, assignment["event_id"], "judge"), 403, "Judge role required")
            project = conn.execute("SELECT track_id FROM projects WHERE id=?", (assignment["project_id"],)).fetchone()
            require(judge_can_review(conn, user["id"], assignment["event_id"], project["track_id"]),
                    403, "This track is outside your judge permissions")
            event = event_row(conn, assignment["event_id"])
            require(event["published_at"] is None, 409, "Published results cannot change")
            if event["judging_close"]:
                require(now() < parse_time(event["judging_close"]), 409, "Judging deadline has passed")
            body = self.body_json()
            submitted = body.get("submit") is True
            values = body.get("scores", {})
            require(isinstance(values, dict), 422, "Scores must be an object")
            old = conn.execute("SELECT * FROM reviews WHERE assignment_id=?", (assignment["id"],)).fetchone()
            rubric = conn.execute("SELECT * FROM rubrics WHERE id=?", (old["rubric_id"],)).fetchone() if old else active_rubric(conn, assignment["event_id"])
            criteria = rubric_criteria(conn, rubric["id"])
            if submitted:
                require(set(values) == {c["code"] for c in criteria}, 422, "All rubric criteria required")
            for criterion in criteria:
                if criterion["code"] in values:
                    score = float(values[criterion["code"]])
                    require(criterion["min_score"] <= score <= criterion["max_score"], 422,
                            "Score outside criterion range")
            review_id = old["id"] if old else uid("rev")
            comment = clean(body.get("comment", old["comment"] if old else ""), 2000)
            conn.execute("""INSERT INTO reviews(id,assignment_id,rubric_id,status,comment,submitted_at,updated_at)
                VALUES(?,?,?,?,?,?,?) ON CONFLICT(assignment_id) DO UPDATE SET status=excluded.status,
                comment=excluded.comment,submitted_at=excluded.submitted_at,updated_at=excluded.updated_at""",
                (review_id, assignment["id"], rubric["id"], "submitted" if submitted else "draft", comment,
                 iso() if submitted else None, iso()))
            for criterion in criteria:
                if criterion["code"] in values:
                    conn.execute("INSERT OR REPLACE INTO criterion_scores VALUES(?,?,?)",
                                 (review_id, criterion["id"], float(values[criterion["code"]])))
            audit(conn, "review_submit" if submitted else "review_save", user["id"], assignment["event_id"],
                  assignment["id"])
            self.send_json(200, {"review_id": review_id, "status": "submitted" if submitted else "draft"})
            return
        if len(parts) == 4 and parts[:2] == ["api", "events"] and parts[3] == "ballot" and method == "GET":
            event = event_row(conn, parts[2])
            self.must_user(user)
            require_voter_access(conn, event["id"], user)
            require(event["status"] == "voting" and
                    (not event["voting_close"] or now() < parse_time(event["voting_close"])),
                    409, "Voting is closed")
            rows = conn.execute("SELECT id,title,summary,track_id,team_id FROM projects WHERE event_id=? AND status='submitted' AND duplicate_of IS NULL",
                                (event["id"],)).fetchall()
            import random
            shuffled = [dict(r) for r in rows]
            random.SystemRandom().shuffle(shuffled)
            has_voted = conn.execute("SELECT 1 FROM votes WHERE event_id=? AND user_id=?",
                                     (event["id"], user["id"])).fetchone() is not None
            self.send_json(200, {"projects": shuffled, "has_voted": has_voted})
            return
        if len(parts) == 4 and parts[:2] == ["api", "events"] and parts[3] == "votes" and method == "POST":
            event = event_row(conn, parts[2])
            self.must_user(user)
            conn.execute("BEGIN IMMEDIATE")  # Serialize eligibility, policy, and duplicate checks.
            event = event_row(conn, parts[2])
            require_voter_access(conn, event["id"], user)
            require(event["status"] == "voting" and
                    (not event["voting_close"] or now() < parse_time(event["voting_close"])),
                    409, "Voting is closed")
            project_id = clean(self.body_json().get("project_id", ""), 100)
            project = conn.execute("SELECT * FROM projects WHERE id=? AND event_id=? AND status='submitted'",
                                   (project_id, event["id"])).fetchone()
            require(project is not None and project["duplicate_of"] is None, 422, "Invalid ballot choice")
            if is_team_member(conn, user, project["team_id"]):
                audit(conn, "vote_self_blocked", user["id"], event["id"], project_id)
                conn.commit()
                raise ApiError(403, "You cannot vote for your own team")
            if conn.execute("SELECT 1 FROM votes WHERE event_id=? AND user_id=?",
                            (event["id"], user["id"])).fetchone():
                audit(conn, "vote_duplicate_blocked", user["id"], event["id"], project_id)
                conn.commit()
                raise ApiError(409, "You have already voted in this event")
            recent = conn.execute("SELECT COUNT(*) FROM votes WHERE user_id=? AND created_at>?",
                                  (user["id"], iso(now()-timedelta(minutes=1)))).fetchone()[0]
            if recent >= 3:
                audit(conn, "vote_rate_limited", user["id"], event["id"], project_id)
                conn.commit()
                raise ApiError(429, "Vote rate limit")
            conn.execute("INSERT INTO votes VALUES(?,?,?,?,?)", (uid("vote"), event["id"], project_id, user["id"], iso()))
            audit(conn, "vote_cast", user["id"], event["id"], project_id)
            self.send_json(201, {"ok": True})
            return
        raise ApiError(404, "Route not found")


def main() -> None:
    seed()
    print("DOGFOOD portal ready on http://localhost:" + str(PORT), flush=True)
    if DEMO_MODE:
        print("Demo password for seeded accounts: " + DEMO_PASSWORD, flush=True)
        for name, (_, token) in DEMO_TOKENS.items():
            print(name + " header: Authorization: Bearer " + token, flush=True)
    server = ThreadingHTTPServer((HOST, PORT), PortalHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
