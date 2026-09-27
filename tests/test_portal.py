"""End-to-end checks using only the Python standard library."""

import importlib.util
import csv
import hashlib
import hmac
import io
import json
import math
import os
import sqlite3
import tempfile
import threading
import time
import unittest
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.client import HTTPConnection
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("dogfood", ROOT / "src" / "dogfood.py")
portal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portal)


class PortalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        portal.DB_PATH = Path(cls.temp.name) / "test.sqlite3"
        portal.seed()
        portal.seed()  # The fixture importer must tolerate a restart.
        cls.server = portal.ThreadingHTTPServer(("127.0.0.1", 0), portal.PortalHandler)
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        cls.temp.cleanup()

    def request(self, method, path, payload=None, token=None, cookie=None):
        headers = {}
        if payload is not None:
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = "Bearer " + token
        if cookie:
            headers["Cookie"] = cookie
        request = Request(self.base + path, method=method, headers=headers,
                          data=json.dumps(payload).encode() if payload is not None else None)
        try:
            response = urlopen(request, timeout=10)
        except HTTPError as error:
            response = error
        content = response.read()
        content_type = response.headers.get("Content-Type", "")
        parsed = json.loads(content) if "application/json" in content_type else content.decode()
        return response.status, parsed, response.headers

    def new_event(self, tracks=None):
        starts = portal.iso(portal.now() - timedelta(hours=1))
        closes = portal.iso(portal.now() + timedelta(hours=1))
        status, created, _ = self.request("POST", "/api/events", {
            "name": portal.uid("Lifecycle"), "starts_at": starts,
            "submissions_close": closes, "tracks": tracks or ["Open", "Hardware"],
            "prizes": [{"title": "Overall"}]}, "dogfood-organizer-2026")
        self.assertEqual(status, 201)
        return created["id"]

    def register(self):
        email = portal.uid("guest") + "@example.org"
        status, _, headers = self.request("POST", "/api/register", {
            "email": email, "name": "Guest User", "password": "safe-password-123"})
        self.assertEqual(status, 201)
        return email, headers["Set-Cookie"].split(";", 1)[0]

    def competing_requests(self, calls):
        """Start together and widen the check/insert window without changing SQL."""
        ready = threading.Barrier(len(calls))
        original_connect = portal.sqlite3.connect

        class SlowMembershipConnection(sqlite3.Connection):
            def execute(self, sql, parameters=()):
                if sql.startswith(("INSERT INTO teams", "INSERT INTO team_members")):
                    time.sleep(0.1)
                return super().execute(sql, parameters)

        def connect(*args, **kwargs):
            return original_connect(*args, **kwargs, factory=SlowMembershipConnection)

        def run(call):
            ready.wait(timeout=5)
            return call()[0]

        with patch.object(portal.sqlite3, "connect", connect), ThreadPoolExecutor(max_workers=len(calls)) as pool:
            return list(pool.map(run, calls))

    def delayed_body_request(self, method, path, payload, token, while_waiting):
        reached = threading.Event()
        original = portal.PortalHandler.body_json

        def observed(handler):
            if handler.headers.get("X-Test-Delayed-Body"):
                reached.set()
            return original(handler)

        body = json.dumps(payload).encode()
        slow = HTTPConnection("127.0.0.1", self.server.server_port, timeout=10)
        try:
            with patch.object(portal.PortalHandler, "body_json", observed):
                slow.putrequest(method, path)
                for key, value in {"Authorization": "Bearer " + token, "Content-Type": "application/json",
                                   "Content-Length": str(len(body)), "X-Test-Delayed-Body": "1"}.items():
                    slow.putheader(key, value)
                slow.endheaders()
                self.assertTrue(reached.wait(5), "Request did not reach body reader")
                while_waiting()
                slow.send(body)
                response = slow.getresponse()
                return response.status, json.loads(response.read())
        finally:
            slow.close()

    def test_inflight_submission_edits_and_reviews_cannot_cross_publication(self):
        org, participant, judge = "dogfood-organizer-2026", "dogfood-participant-2026", "dogfood-judge-a-2026"
        for operation in ("create", "edit", "review"):
            with self.subTest(operation=operation):
                event = self.new_event()
                track = self.request("GET", f"/api/events/{event}")[1]["tracks"][0]["id"]
                team = self.request("POST", f"/api/events/{event}/teams", {"name": "Deadline team"}, participant)[1]["id"]
                payload = {"team_id": team, "track_id": track, "title": "Original", "submit": True}
                project = self.request("POST", f"/api/events/{event}/projects", payload, participant)[1]["id"]
                method, path, token = "POST", f"/api/events/{event}/projects", participant
                if operation == "edit":
                    method, path, payload = "PATCH", f"/api/projects/{project}", {"title": "Too late"}
                if operation == "review":
                    self.assertEqual(self.request("POST", f"/api/events/{event}/roles", {
                        "email": "marek.nowak@example.org", "role": "judge"}, org)[0], 200)
                    assignment = self.request("POST", f"/api/events/{event}/assignments", {
                        "project_id": project, "judge_user_id": "judge_jdg_08"}, org)[1]["id"]
                    method, path, token = "PUT", f"/api/assignments/{assignment}/review", judge
                    payload = {"scores": {"functionality": 5, "quality": 5, "innovation": 5}, "submit": True}

                def close_and_publish():
                    self.assertEqual(self.request("PATCH", f"/api/events/{event}", {
                        "submissions_close": portal.iso(portal.now()-timedelta(seconds=2))}, org)[0], 200)
                    self.assertEqual(self.request("POST", f"/api/events/{event}/publish", {}, org)[0], 200)

                self.assertEqual(self.delayed_body_request(method, path, payload, token, close_and_publish)[0], 409)
                projects = self.request("GET", f"/api/events/{event}/projects")[1]["projects"]
                results = self.request("GET", f"/api/events/{event}/results")[1]["results"]
                self.assertEqual([p["title"] for p in projects], ["Original"])
                self.assertEqual(len(results), 1)
                self.assertEqual(results[0]["review_count"], 0)

    def test_concurrent_team_creation_and_invite_acceptance(self):
        participant = "dogfood-participant-2026"
        event = self.new_event()
        path = f"/api/events/{event}/teams"
        statuses = self.competing_requests([
            lambda: self.request("POST", path, {"name": "Competing team"}, participant)
            for _ in range(4)])
        self.assertEqual(sorted(statuses), [201, 409, 409, 409])
        teams = self.request("GET", path, token=participant)[1]["teams"]
        self.assertEqual(sum(t["is_member"] for t in teams), 1)
        team = next(t["id"] for t in teams if t["is_member"])
        invite = self.request("POST", f"/api/teams/{team}/invites", {}, participant)[1]
        accept = f"/api/invites/{invite['token']}/accept"
        for _ in range(2):
            cookie = self.register()[1]
            self.assertEqual(self.request("POST", accept, {}, cookie=cookie)[0], 200)
        cookies = [self.register()[1] for _ in range(3)]
        statuses = self.competing_requests([
            lambda cookie=cookie: self.request("POST", accept, {}, cookie=cookie)
            for cookie in cookies])
        self.assertEqual(sorted(statuses), [200, 404, 404])
        with portal.db() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM team_members WHERE team_id=?", (team,)).fetchone()[0], 4)
            uses = conn.execute("SELECT uses,max_uses FROM team_invites WHERE token_hash=?",
                                (portal.token_hash(invite["token"]),)).fetchone()
            self.assertEqual(tuple(uses), (3, 3))

        # A person accepting invitations to different teams still gets one membership.
        other_event = self.new_event()
        owner_cookie = self.register()[1]
        first_team = self.request("POST", f"/api/events/{other_event}/teams", {"name": "First"}, participant)[1]["id"]
        second_team = self.request("POST", f"/api/events/{other_event}/teams", {"name": "Second"}, cookie=owner_cookie)[1]["id"]
        first = self.request("POST", f"/api/teams/{first_team}/invites", {}, participant)[1]["token"]
        second = self.request("POST", f"/api/teams/{second_team}/invites", {}, cookie=owner_cookie)[1]["token"]
        joining_cookie = self.register()[1]
        statuses = self.competing_requests([
            lambda token=token: self.request("POST", f"/api/invites/{token}/accept", {}, cookie=joining_cookie)
            for token in (first, second)])
        self.assertEqual(sorted(statuses), [200, 409])

    def test_track_scopes_block_assignment_and_recheck_existing_reviews(self):
        org, judge = "dogfood-organizer-2026", "dogfood-judge-a-2026"
        event_id = self.new_event()
        tracks = self.request("GET", f"/api/events/{event_id}")[1]["tracks"]
        team = self.request("POST", f"/api/events/{event_id}/teams", {"name": "Scoped team"},
                            "dogfood-participant-2026")[1]["id"]
        project = self.request("POST", f"/api/events/{event_id}/projects", {
            "team_id": team, "track_id": tracks[0]["id"], "title": "Scoped entry", "submit": True},
            "dogfood-participant-2026")[1]["id"]
        path = f"/api/events/{event_id}/roles"
        grant = {"email": "marek.nowak@example.org", "role": "judge", "track_ids": [tracks[1]["id"]]}
        self.assertEqual(self.request("POST", path, grant, org)[0], 200)
        assignment = {"project_id": project, "judge_user_id": "judge_jdg_08"}
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/assignments", assignment, org)[0], 422)
        grant["track_ids"] = [tracks[0]["id"]]
        self.assertEqual(self.request("POST", path, grant, org)[0], 200)
        status, created, _ = self.request("POST", f"/api/events/{event_id}/assignments", assignment, org)
        self.assertEqual(status, 201)
        scores_path = "/api/judges/judge_jdg_08/scores"
        own = self.request("GET", scores_path, token=judge)[1]["assignments"]
        review = next(r for r in own if r["assignment_id"] == created["id"])
        values = {c["code"]: 4 for c in review["criteria"]}
        review_path = f"/api/assignments/{created['id']}/review"
        self.assertEqual(self.request("PUT", review_path, {"scores": values, "submit": True}, judge)[0], 200)
        grant["track_ids"] = [tracks[1]["id"]]
        self.request("POST", path, grant, org)
        self.assertEqual(self.request("PUT", review_path, {"scores": values, "submit": True}, judge)[0], 403)
        own = self.request("GET", scores_path, token=judge)[1]["assignments"]
        self.assertFalse(any(r["assignment_id"] == created["id"] for r in own))
        self.assertEqual(self.request("POST", path, {**grant, "track_ids": ["trk_01"]}, org)[0], 422)
        fixture = json.loads((ROOT / "fixtures.json").read_text())
        with portal.db() as conn:
            for item in fixture["judges"]:
                self.assertEqual(portal.judge_track_scope(conn, "evt_01", "judge_" + item["id"]), item["tracks"])

    def test_batch_assignment_reports_shortfalls_and_unassigned_judges(self):
        org, participant = "dogfood-organizer-2026", "dogfood-participant-2026"
        event = self.new_event()
        track = self.request("GET", f"/api/events/{event}")[1]["tracks"][0]["id"]
        team = self.request("POST", f"/api/events/{event}/teams", {"name": "Batch team"}, participant)[1]["id"]
        self.request("POST", f"/api/events/{event}/projects", {
            "team_id": team, "track_id": track, "title": "Batch project", "submit": True}, participant)
        for email in ["marek.nowak@example.org", "priya.nair@example.org", "participant@demo.local"]:
            self.request("POST", f"/api/events/{event}/roles", {"email": email, "role": "judge"}, org)
        progress = self.request("GET", f"/api/events/{event}/progress", token=org)[1]
        self.assertEqual(len(progress["judges"]), 3)
        self.assertTrue(all(j["assigned"] == 0 and j["percent"] == 0 for j in progress["judges"]))
        path = f"/api/events/{event}/assignments/batch"
        self.assertEqual(self.request("POST", path, {}, participant)[0], 403)
        self.assertEqual(self.request("POST", path, {"reviews_per_project": 0}, org)[0], 422)
        status, batch, _ = self.request("POST", path, {"reviews_per_project": 3}, org)
        self.assertEqual(status, 201)
        self.assertEqual(batch["created"], 2)
        self.assertEqual(batch["shortfalls"][0]["missing"], 1)
        self.assertEqual(self.request("POST", path, {"reviews_per_project": 3}, org)[1]["created"], 0)
        progress = self.request("GET", f"/api/events/{event}/progress", token=org)[1]
        self.assertEqual(progress["assigned"], 2)
        owner = next(j for j in progress["judges"] if j["judge_user_id"] == "demo_participant")
        self.assertEqual(owner["assigned"], 0)

    def test_custom_questions_enforce_submission_and_preserve_drafts(self):
        org, participant = "dogfood-organizer-2026", "dogfood-participant-2026"
        event = self.new_event()
        path = f"/api/events/{event}/questions"
        questions = {"questions": [{"code": "problem", "label": "Problem solved", "required": True}]}
        self.assertEqual(self.request("PUT", path, questions, participant)[0], 403)
        self.assertEqual(self.request("PUT", path, questions, org)[0], 200)
        detail = self.request("GET", f"/api/events/{event}")[1]
        self.assertEqual(detail["questions"][0]["code"], "problem")
        team = self.request("POST", f"/api/events/{event}/teams", {"name": "Question team"}, participant)[1]["id"]
        body = {"team_id": team, "track_id": detail["tracks"][0]["id"], "title": "Question project"}
        self.assertEqual(self.request("POST", f"/api/events/{event}/projects", {**body, "submit": True}, participant)[0], 422)
        status, project, _ = self.request("POST", f"/api/events/{event}/projects", body, participant)
        self.assertEqual(status, 201)
        project_path = f"/api/projects/{project['id']}"
        self.assertEqual(self.request("POST", project_path+"/submit", {}, participant)[0], 422)
        self.assertEqual(self.request("PATCH", project_path, {"custom_answers": {"unknown": "bad"}}, participant)[0], 422)
        self.assertEqual(self.request("PATCH", project_path, {"custom_answers": {"problem": "A real problem"}}, participant)[0], 200)
        self.assertEqual(self.request("POST", project_path+"/submit", {}, participant)[0], 200)
        self.assertEqual(self.request("PATCH", project_path, {"custom_answers": {}}, participant)[0], 422)
        self.assertEqual(self.request("GET", project_path)[1]["project"]["custom_answers"]["problem"], "A real problem")
        self.assertEqual(self.request("PATCH", project_path, {"description": "<script>alert('unsafe')</script>",
            "demo_url": "https://example.org/video", "tech_tags": ["SQLite"]}, participant)[0], 200)
        page = self.request("GET", project_path.replace("/api/", "/"))[1]
        self.assertIn("A real problem", page)
        self.assertIn("https://example.org/video", page)
        self.assertIn("SQLite", page)
        self.assertIn("&lt;script&gt;", page)
        self.assertNotIn("<script>alert", page)
        self.assertEqual(self.request("PUT", path, {"questions": []}, org)[0], 409)

    def test_full_archive_restores_fixture_history_and_locked_identities(self):
        org = "dogfood-organizer-2026"
        archive = self.request("GET", "/api/events/evt_01/export.json", token=org)[1]
        renamed = next(u for u in archive["users"] if u["email"] == "marek.nowak@example.org")
        renamed["email"] = "archive-owner-" + portal.uid("test") + "@example.org"
        target = self.new_event()
        status, restored, _ = self.request("POST", f"/api/events/{target}/import.json", archive, org)
        self.assertEqual(status, 201, restored)
        self.assertEqual(restored["projects_created"], 41)
        self.assertEqual(restored["history"]["reviews"], 126)
        self.assertIn(renamed["email"], restored["accounts_to_activate"])
        exported = self.request("GET", f"/api/events/{target}/export.json", token=org)[1]
        for table in ("projects", "teams", "reviews", "criterion_scores", "assignments", "judge_track_scopes"):
            self.assertEqual(len(exported[table]), len(archive[table]), table)
        ids = {r["id"] for r in exported["projects"]}
        duplicate = next(r for r in exported["projects"] if r["duplicate_of"])
        self.assertIn(duplicate["duplicate_of"], ids)
        account = {"email": renamed["email"], "name": "Restored judge", "password": "restored-password-123"}
        self.assertEqual(self.request("POST", "/api/register", account)[0], 409)
        invite = self.request("POST", f"/api/events/{target}/role-invites", {"email": renamed["email"], "role": "judge"}, org)[1]
        account["invite_token"] = invite["invite_path"].rsplit("/", 1)[1]
        self.assertEqual(self.request("POST", "/api/register", account)[0], 201)
        self.assertEqual(self.request("POST", "/api/login", account)[0], 200)
        broken = json.loads(json.dumps(archive))
        broken["criterion_scores"][0]["criterion_id"] = "missing"
        empty = self.new_event()
        self.assertEqual(self.request("POST", f"/api/events/{empty}/import.json", broken, org)[0], 422)
        self.assertEqual(self.request("GET", f"/api/events/{empty}/projects")[1]["projects"], [])
        self.assertEqual(len(self.request("GET", f"/api/events/{empty}")[1]["tracks"]), 2)
        _, voter_cookie = self.register()
        vote_project = self.request("GET", "/api/events/evt_vote_demo/projects")[1]["projects"][0]["id"]
        self.assertEqual(self.request("POST", f"/api/projects/{vote_project}/comments", {"body": "Portable discussion"}, cookie=voter_cookie)[0], 201)
        self.assertEqual(self.request("POST", "/api/events/evt_vote_demo/votes", {"project_id": vote_project}, cookie=voter_cookie)[0], 201)
        public_archive = self.request("GET", "/api/events/evt_vote_demo/export.json", token=org)[1]
        vote_target = self.new_event()
        self.assertEqual(self.request("POST", f"/api/events/{vote_target}/import.json", public_archive, org)[0], 201)
        roundtrip = self.request("GET", f"/api/events/{vote_target}/export.json", token=org)[1]
        self.assertEqual(len(roundtrip["votes"]), len(public_archive["votes"]))
        self.assertEqual([c["body"] for c in roundtrip["comments"]], [c["body"] for c in public_archive["comments"]])

    def test_voting_policy_requires_email_bound_single_use_invitation(self):
        org, participant = "dogfood-organizer-2026", "dogfood-participant-2026"
        event = self.new_event()
        track = self.request("GET", f"/api/events/{event}")[1]["tracks"][0]["id"]
        team = self.request("POST", f"/api/events/{event}/teams", {"name": "Voting team"}, participant)[1]["id"]
        project = self.request("POST", f"/api/events/{event}/projects", {
            "team_id": team, "track_id": track, "title": "Invitation ballot", "submit": True}, participant)[1]["id"]
        self.request("PATCH", f"/api/events/{event}", {"status": "voting", "submissions_close": portal.iso(portal.now()-timedelta(minutes=1)),
            "voting_close": portal.iso(portal.now()+timedelta(hours=1))}, org)
        path = f"/api/events/{event}/voting-policy"
        self.assertEqual(self.request("PUT", path, {"mode": "invitation"}, participant)[0], 403)
        self.assertEqual(self.request("PUT", path, {"mode": "invitation"}, org)[0], 200)
        email, cookie = self.register()
        _, other = self.register()
        ballot, votes = f"/api/events/{event}/ballot", f"/api/events/{event}/votes"
        self.assertEqual(self.request("GET", ballot, cookie=cookie)[0], 403)
        self.assertEqual(self.request("POST", votes, {"project_id": project}, cookie=cookie)[0], 403)
        invite = self.request("POST", f"/api/events/{event}/voter-invites", {"email": email}, org)[1]
        self.assertEqual(self.request("GET", invite["invite_path"])[0], 200)
        accept = invite["invite_path"].replace("/vote-invite/", "/api/voter-invites/")+"/accept"
        self.assertEqual(self.request("POST", accept, {}, cookie=other)[0], 403)
        self.assertEqual(self.request("POST", accept, {}, cookie=cookie)[0], 200)
        self.assertEqual(self.request("POST", accept, {}, cookie=cookie)[0], 404)
        self.assertEqual(self.request("GET", ballot, cookie=cookie)[0], 200)
        self.assertEqual(self.request("POST", votes, {"project_id": project}, cookie=cookie)[0], 201)
        self.assertEqual(self.request("POST", votes, {"project_id": project}, cookie=cookie)[0], 409)
        self.assertEqual(self.request("POST", votes, {"project_id": project}, cookie=other)[0], 403)
        self.assertEqual(self.request("PUT", path, {"mode": "authenticated"}, org)[0], 409)
        self.assertEqual(self.request("GET", f"/api/events/{event}/community-results", cookie=cookie)[0], 403)
        archive = self.request("GET", f"/api/events/{event}/export.json", token=org)[1]
        destination = self.new_event()
        self.assertEqual(self.request("POST", f"/api/events/{destination}/import.json", archive, org)[0], 201)
        self.assertEqual(self.request("GET", f"/api/events/{destination}")[1]["voting_policy"], "invitation")
        self.assertEqual(self.request("GET", f"/api/events/{destination}/ballot", cookie=other)[0], 403)
        self.assertTrue(self.request("GET", f"/api/events/{destination}/ballot", cookie=cookie)[1]["has_voted"])

    def test_jury_preview_has_a_submittable_review(self):
        judge = "dogfood-judge-a-2026"
        judge_id = self.request("GET", "/api/me", token=judge)[1]["user"]["id"]
        event = self.request("GET", "/api/events/evt_review_demo")[1]["event"]
        self.assertEqual(event["status"], "judging")
        self.assertGreater(portal.parse_time(event["judging_close"]), portal.now())
        scores_path = f"/api/judges/{judge_id}/scores"
        reviews = self.request("GET", scores_path, token=judge)[1]["assignments"]
        pending = next(item for item in reviews if item["assignment_id"] == "review_demo_assignment")
        self.assertNotEqual(pending["review_status"], "submitted")
        values = {criterion["code"]: 4 for criterion in pending["criteria"]}
        review_path = "/api/assignments/review_demo_assignment/review"
        self.assertEqual(self.request("PUT", review_path,
                                      {"scores": values, "comment": "Ready to judge", "submit": True},
                                      judge)[0], 200)
        updated = self.request("GET", scores_path, token=judge)[1]["assignments"]
        self.assertEqual(next(item for item in updated
                              if item["assignment_id"] == "review_demo_assignment")["review_status"],
                         "submitted")
        self.assertEqual(self.request("PUT", review_path,
                                      {"scores": values, "submit": True},
                                      "dogfood-participant-2026")[0], 403)

    def test_t4_archive_records_and_embeddable_gallery(self):
        organizer = "dogfood-organizer-2026"
        participant = "dogfood-participant-2026"
        judge = "dogfood-judge-a-2026"
        event_id = self.new_event(tracks=["Open"])
        track_id = self.request("GET", f"/api/events/{event_id}")[1]["tracks"][0]["id"]
        team_id = self.request("POST", f"/api/events/{event_id}/teams",
                               {"name": "Portable team"}, participant)[1]["id"]
        details = {"team_id": team_id, "track_id": track_id, "title": "Portable project",
                   "summary": "A project that travels", "tagline": "Build once, run anywhere",
                   "description": "Detailed project story", "tech_tags": ["Python", "SQLite"],
                   "image_urls": ["https://example.org/image.png"],
                   "live_url": "https://example.org/demo", "submit": True}
        project_id = self.request("POST", f"/api/events/{event_id}/projects", details, participant)[1]["id"]
        loaded = self.request("GET", f"/api/projects/{project_id}")[1]["project"]
        self.assertEqual(loaded["tech_tags"], ["Python", "SQLite"])
        self.assertEqual(loaded["tagline"], details["tagline"])
        self.assertEqual(self.request("PATCH", f"/api/projects/{project_id}",
                                      {"demo_url": "not-a-url"}, participant)[0], 422)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/roles", {
            "email": "marek.nowak@example.org", "role": "judge"}, organizer)[0], 200)
        judge_id = self.request("GET", "/api/me", token=judge)[1]["user"]["id"]
        assignment_id = self.request("POST", f"/api/events/{event_id}/assignments", {
            "project_id": project_id, "judge_user_id": judge_id}, organizer)[1]["id"]
        self.assertEqual(self.request("PUT", f"/api/assignments/{assignment_id}/review", {
            "scores": {"functionality": 4, "quality": 5, "innovation": 3},
            "submit": True}, judge)[0], 200)
        self.assertEqual(self.request("GET", f"/api/events/{event_id}/reviews", token=participant)[0], 403)
        self.assertEqual(self.request("GET", f"/api/events/{event_id}/reviews", token=organizer)[1]
                         ["reviews"][0]["raw_score"], 4)
        self.assertEqual(self.request("PATCH", f"/api/events/{event_id}", {
            "submissions_close": portal.iso(portal.now()-timedelta(minutes=1))}, organizer)[0], 200)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/publish", {}, organizer)[0], 200)
        self.assertEqual(self.request("GET", f"/api/events/{event_id}/records", token=participant)[0], 403)
        records = self.request("GET", f"/api/events/{event_id}/records", token=organizer)[1]["records"]
        self.assertEqual({item["kind"] for item in records}, {"judge", "project"})
        self.assertEqual(len(self.request("GET", f"/api/events/{event_id}/my-records", token=judge)[1]
                             ["records"]), 1)
        self.assertEqual(len(self.request("GET", f"/api/events/{event_id}/my-records", token=participant)[1]
                             ["records"]), 1)
        for record in records:
            path = f"/api/records/{record['id']}?sig={record['signature']}"
            self.assertTrue(self.request("GET", path)[1]["verified"])
            self.assertEqual(self.request("GET", f"/api/records/{record['id']}?sig=wrong")[0], 403)
            self.assertIn("SIGNED", self.request("GET", f"/certificates/{record['id']}?sig={record['signature']}")[1])
        self.assertIn("Portable project", self.request("GET", f"/embed/events/{event_id}")[1])
        self.assertEqual(self.request("GET", f"/api/events/{event_id}/export.json", token=participant)[0], 403)
        archive = self.request("GET", f"/api/events/{event_id}/export.json", token=organizer)[1]
        self.assertEqual(archive["schema"], "dogfood-event-v1")
        self.assertTrue(archive["project_details"])
        destination = self.new_event(tracks=["Different"])
        imported = self.request("POST", f"/api/events/{destination}/import.json", archive, organizer)
        self.assertEqual(imported[0], 201)
        self.assertEqual(imported[1]["projects_created"], 1)
        self.assertEqual(imported[1]["tracks_created"], 1)
        self.assertEqual(imported[1]["members_added"], 1)
        self.assertEqual(self.request("POST", f"/api/events/{destination}/import.json",
                                      archive, organizer)[0], 409)
        restored = self.request("GET", f"/api/events/{destination}/export.json", token=organizer)[1]
        for table in ("reviews", "criterion_scores", "assignments", "result_snapshots", "event_roles"):
            self.assertEqual(len(restored[table]), len(archive[table]), table)
        self.assertEqual(restored["result_snapshots"][0]["adjusted_score"], archive["result_snapshots"][0]["adjusted_score"])
        self.assertEqual(len(restored["issued_records"]), len(archive["issued_records"]))
        self.assertEqual(restored["event"]["status"], "published")
        copied = self.request("GET", f"/api/events/{destination}/projects")[1]["projects"]
        self.assertEqual(copied[0]["tech_tags"], ["Python", "SQLite"])
        with portal.db() as conn:
            self.assertEqual(conn.execute("""SELECT COUNT(*) FROM team_members tm
                JOIN teams t ON t.id=tm.team_id WHERE t.event_id=? AND tm.user_id=(
                SELECT id FROM users WHERE email='participant@demo.local')""", (destination,)).fetchone()[0], 1)
        self.assertEqual(self.request("GET", "/api/openapi.json")[1]["openapi"], "3.1.0")

    def test_t4_signed_webhook_delivery(self):
        received = []
        class Receiver(BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers["Content-Length"]))
                received.append((body, self.headers.get("X-Dogfood-Signature", "")))
                self.send_response(204)
                self.end_headers()
            def log_message(self, *_):
                pass
        receiver = ThreadingHTTPServer(("127.0.0.1", 0), Receiver)
        thread = threading.Thread(target=receiver.serve_forever, daemon=True)
        thread.start()
        try:
            event_id = self.new_event()
            organizer = "dogfood-organizer-2026"
            url = f"http://127.0.0.1:{receiver.server_port}/hook"
            created = self.request("POST", f"/api/events/{event_id}/webhooks", {"url": url}, organizer)
            self.assertEqual(created[0], 201)
            secret = created[1]["secret"]
            self.assertNotIn("secret", self.request("GET", f"/api/events/{event_id}/webhooks",
                                                    token=organizer)[1]["webhooks"][0])
            self.assertEqual(self.request("POST", f"/api/events/{event_id}/tracks",
                                          {"name": "Webhook track"}, organizer)[0], 201)
            for _ in range(40):
                if any(json.loads(body)["action"] == "track_create" for body, _ in received):
                    break
                time.sleep(.05)
            match = next((item for item in received if json.loads(item[0])["action"] == "track_create"), None)
            self.assertIsNotNone(match)
            expected = hmac.new(bytes.fromhex(secret), match[0], hashlib.sha256).hexdigest()
            self.assertEqual(match[1], "sha256=" + expected)
            deliveries = self.request("GET", f"/api/events/{event_id}/webhooks/deliveries",
                                      token=organizer)[1]["deliveries"]
            self.assertTrue(any(item["delivered_at"] for item in deliveries))
        finally:
            receiver.shutdown()
            receiver.server_close()
            thread.join(timeout=5)

    def test_t3_ballot_comments_privacy_and_abuse_controls(self):
        organizer = "dogfood-organizer-2026"
        participant = "dogfood-participant-2026"
        event_id = self.new_event()
        track_id = self.request("GET", f"/api/events/{event_id}")[1]["tracks"][0]["id"]
        team_a = self.request("POST", f"/api/events/{event_id}/teams",
                              {"name": "Community A"}, participant)[1]["id"]
        project_a = self.request("POST", f"/api/events/{event_id}/projects", {
            "team_id": team_a, "track_id": track_id, "title": "Community A project",
            "submit": True}, participant)[1]["id"]
        _, member = self.register()
        team_b = self.request("POST", f"/api/events/{event_id}/teams",
                              {"name": "Community B"}, cookie=member)[1]["id"]
        project_b = self.request("POST", f"/api/events/{event_id}/projects", {
            "team_id": team_b, "track_id": track_id, "title": "Community B project",
            "submit": True}, cookie=member)[1]["id"]
        _, voter = self.register()
        self.assertEqual(self.request("PATCH", f"/api/events/{event_id}", {
            "submissions_close": portal.iso(portal.now()-timedelta(minutes=20)),
            "voting_close": portal.iso(portal.now()+timedelta(hours=1)),
            "status": "voting"}, organizer)[0], 200)
        ballot_path = f"/api/events/{event_id}/ballot"
        vote_path = f"/api/events/{event_id}/votes"
        self.assertEqual(self.request("GET", ballot_path)[0], 401)
        orders = []
        for _ in range(20):
            ballot = self.request("GET", ballot_path, cookie=voter)[1]
            orders.append(tuple(item["id"] for item in ballot["projects"]))
            self.assertFalse(ballot["has_voted"])
        self.assertEqual(set(orders[0]), {project_a, project_b})
        self.assertGreater(len(set(orders)), 1)
        self.assertEqual(self.request("GET", f"/api/events/{event_id}/results")[0], 403)
        self.assertEqual(self.request("GET", f"/api/events/{event_id}/community-results")[0], 403)
        self.assertEqual(self.request("POST", vote_path, {"project_id": project_a})[0], 401)
        self.assertEqual(self.request("POST", vote_path, {"project_id": project_a}, participant)[0], 403)
        self.assertEqual(self.request("POST", vote_path, {"project_id": "missing"}, cookie=voter)[0], 422)
        self.assertEqual(self.request("POST", vote_path, {"project_id": project_b}, cookie=voter)[0], 201)
        self.assertTrue(self.request("GET", ballot_path, cookie=voter)[1]["has_voted"])
        self.assertEqual(self.request("POST", vote_path, {"project_id": project_a}, cookie=voter)[0], 409)
        self.assertEqual(self.request("POST", vote_path, {"project_id": project_a}, participant)[0], 403)

        comments_path = f"/api/projects/{project_a}/comments"
        self.assertEqual(self.request("POST", comments_path, {"body": "Visitor"})[0], 401)
        status, comment, _ = self.request("POST", comments_path,
                                          {"body": "<script>alert(1)</script> Good work"}, cookie=voter)
        self.assertEqual(status, 201)
        self.assertIn("Good work", self.request("GET", comments_path)[1]["comments"][0]["body"])
        self.assertEqual(self.request("POST", comments_path,
                                      {"body": "<SCRIPT>alert(1)</SCRIPT>   Good work"}, cookie=voter)[0], 409)
        public_page = self.request("GET", f"/projects/{project_a}")[1]
        self.assertIn("&lt;script&gt;", public_page)
        self.assertNotIn("<script>alert(1)</script>", public_page)
        self.assertEqual(self.request("PATCH", f"/api/comments/{comment['id']}",
                                      {"status": "hidden"}, cookie=voter)[0], 403)
        self.assertEqual(self.request("PATCH", f"/api/comments/{comment['id']}",
                                      {"status": "hidden"}, organizer)[0], 200)
        self.assertEqual(self.request("GET", comments_path)[1]["comments"], [])
        for index in range(4):
            self.assertEqual(self.request("POST", comments_path,
                                          {"body": f"Fresh comment {index}"}, cookie=voter)[0], 201)
        self.assertEqual(self.request("POST", comments_path,
                                      {"body": "Extra comment"}, cookie=voter)[0], 429)

        self.assertEqual(self.request("PATCH", f"/api/events/{event_id}", {
            "voting_close": portal.iso(portal.now()-timedelta(minutes=1))}, organizer)[0], 200)
        self.assertEqual(self.request("GET", ballot_path, cookie=voter)[0], 409)
        self.assertEqual(self.request("POST", vote_path, {"project_id": project_a}, participant)[0], 409)
        self.assertEqual(self.request("GET", f"/api/events/{event_id}/community-results")[0], 403)
        organizer_tally = self.request("GET", f"/api/events/{event_id}/community-results",
                                       token=organizer)[1]["results"]
        self.assertEqual(sum(item["votes"] for item in organizer_tally), 1)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/publish", {}, organizer)[0], 200)
        public_tally = self.request("GET", f"/api/events/{event_id}/community-results")[1]["results"]
        self.assertEqual({item["project_id"]: item["votes"] for item in public_tally},
                         {project_a: 0, project_b: 1})
        actions = {item["action"] for item in self.request(
            "GET", f"/api/events/{event_id}/audit", token=organizer)[1]["events"]}
        self.assertTrue({"vote_cast", "vote_duplicate_blocked", "vote_self_blocked",
                         "comment_create", "comment_duplicate_blocked", "comment_rate_limited",
                         "comment_moderate"}.issubset(actions))

    def test_t1_sessions_and_event_role_permissions(self):
        self.assertIsNone(self.request("GET", "/api/me")[1]["user"])
        email, cookie = self.register()
        self.assertEqual(self.request("GET", "/api/me", cookie=cookie)[1]["user"]["email"], email)
        self.assertEqual(self.request("POST", "/api/login", {"email": email, "password": "wrong-password"})[0], 401)
        event_id = self.new_event()
        self.assertEqual(self.request("PATCH", f"/api/events/{event_id}", {"name": "Unauthorized"})[0], 401)
        self.assertEqual(self.request("PATCH", f"/api/events/{event_id}", {"name": "Unauthorized"}, cookie=cookie)[0], 403)
        status, _, headers = self.request("POST", "/api/login", {
            "email": "admin@demo.local", "password": portal.DEMO_PASSWORD})
        self.assertEqual(status, 200)
        admin_cookie = headers["Set-Cookie"].split(";", 1)[0]
        self.assertTrue(self.request("GET", f"/api/events/{event_id}", cookie=admin_cookie)[1]["can_manage"])
        self.assertEqual(self.request("PATCH", f"/api/events/{event_id}",
                                      {"description": "Managed by admin"}, cookie=admin_cookie)[0], 200)
        self.assertEqual(self.request("POST", "/api/logout", {}, cookie=cookie)[0], 200)
        self.assertIsNone(self.request("GET", "/api/me", cookie=cookie)[1]["user"])
        self.assertEqual(self.request("POST", "/api/events", {
            "name": "No track", "starts_at": portal.iso(portal.now()),
            "submissions_close": portal.iso(portal.now()+timedelta(hours=1)), "tracks": []},
            "dogfood-organizer-2026")[0], 422)
        self.assertEqual(self.request("POST", "/api/events", {
            "name": "Naive dates", "starts_at": "2026-09-25T10:00:00",
            "submissions_close": "2026-09-25T11:00:00", "tracks": ["Open"]},
            "dogfood-organizer-2026")[0], 422)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/prizes",
                                      {"title": ""}, "dogfood-organizer-2026")[0], 422)

    def test_t1_team_invites_gallery_and_deadline_matrix(self):
        event_id = self.new_event()
        participant = "dogfood-participant-2026"
        detail = self.request("GET", f"/api/events/{event_id}")[1]
        track_id = detail["tracks"][0]["id"]
        status, team, _ = self.request("POST", f"/api/events/{event_id}/teams",
                                       {"name": "Four person team"}, participant)
        self.assertEqual(status, 201)
        team_id = team["id"]
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/teams",
                                      {"name": "Second team"}, participant)[0], 409)
        status, invite, _ = self.request("POST", f"/api/teams/{team_id}/invites", {}, participant)
        self.assertEqual(status, 201)
        accept = invite["invite_path"].replace("/join/", "/api/invites/") + "/accept"
        member_cookies = []
        for _ in range(3):
            _, cookie = self.register()
            self.assertEqual(self.request("POST", accept, {}, cookie=cookie)[0], 200)
            member_cookies.append(cookie)
        self.assertEqual(self.request("POST", accept, {}, cookie=member_cookies[0])[0], 404)
        _, outsider = self.register()
        self.assertEqual(self.request("POST", accept, {}, cookie=outsider)[0], 404)
        status, project, _ = self.request("POST", f"/api/events/{event_id}/projects", {
            "team_id": team_id, "track_id": track_id, "title": "<script>alert(1)</script> Rocket",
            "summary": "Solar energy research", "repo_url": "https://example.org/repo"}, participant)
        self.assertEqual((status, project["status"]), (201, "draft"))
        project_id = project["id"]
        self.assertEqual(self.request("GET", f"/api/projects/{project_id}", cookie=outsider)[0], 403)
        self.assertEqual(self.request("PATCH", f"/api/projects/{project_id}",
                                      {"title": "Stolen"}, cookie=outsider)[0], 403)
        self.assertNotIn("Solar energy research", self.request("GET", f"/events/{event_id}/projects")[1])
        self.assertEqual(self.request("PATCH", f"/api/projects/{project_id}",
                                      {"title": "Rocket demo <script>alert(1)</script>"},
                                      cookie=member_cookies[0])[0], 200)
        self.assertEqual(self.request("POST", f"/api/projects/{project_id}/submit", {}, participant)[0], 200)
        search = self.request("GET", f"/events/{event_id}/projects?q=Solar")[1]
        self.assertIn("Rocket demo", search)
        self.assertNotIn("<script>", search)
        self.assertIn("Rocket demo", self.request("GET", f"/events/{event_id}/projects?track={quote(track_id)}")[1])
        self.assertNotIn("Rocket demo", self.request("GET", f"/events/{event_id}/projects?track=other")[1])
        self.assertEqual(self.request("PATCH", f"/api/events/{event_id}", {
            "submissions_close": portal.iso(portal.now()-timedelta(minutes=1))},
            "dogfood-organizer-2026")[0], 200)
        self.assertEqual(self.request("PATCH", f"/api/projects/{project_id}",
                                      {"title": "Late edit"}, participant)[0], 409)
        self.assertEqual(self.request("POST", f"/api/projects/{project_id}/submit", {}, participant)[0], 409)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/projects", {
            "team_id": team_id, "track_id": track_id, "title": "Late entry"}, participant)[0], 409)
        self.assertEqual(self.request("POST", f"/api/teams/{team_id}/invites", {}, participant)[0], 409)

    def test_t2_private_reviews_progress_normalization_and_frozen_results(self):
        organizer = "dogfood-organizer-2026"
        judge_a = "dogfood-judge-a-2026"
        judge_b = "dogfood-judge-b-2026"
        participant = "dogfood-participant-2026"
        event_id = self.new_event()
        track_id = self.request("GET", f"/api/events/{event_id}")[1]["tracks"][0]["id"]
        team_id = self.request("POST", f"/api/events/{event_id}/teams",
                               {"name": "Judging team"}, participant)[1]["id"]
        project_id = self.request("POST", f"/api/events/{event_id}/projects", {
            "team_id": team_id, "track_id": track_id, "title": "=SUM(1,2)", "submit": True}, participant)[1]["id"]
        invite = self.request("POST", f"/api/events/{event_id}/role-invites", {
            "email": "marek.nowak@example.org", "role": "judge"}, organizer)[1]
        accept = invite["invite_path"].replace("/role-invite/", "/api/role-invites/") + "/accept"
        self.assertEqual(self.request("POST", accept, {}, judge_a)[0], 200)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/roles", {
            "email": "priya.nair@example.org", "role": "judge"}, organizer)[0], 200)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/roles", {
            "email": "participant@demo.local", "role": "judge"}, organizer)[0], 200)
        judges = self.request("GET", f"/api/events/{event_id}/judges", token=organizer)[1]["judges"]
        ids = {judge["email"]: judge["id"] for judge in judges}
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/assignments", {
            "project_id": project_id, "judge_user_id": ids["participant@demo.local"]}, organizer)[0], 409)
        assignment_a = self.request("POST", f"/api/events/{event_id}/assignments", {
            "project_id": project_id, "judge_user_id": ids["marek.nowak@example.org"]}, organizer)[1]["id"]
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/assignments", {
            "project_id": project_id, "judge_user_id": ids["priya.nair@example.org"]}, organizer)[0], 201)
        team_invite = self.request("POST", f"/api/teams/{team_id}/invites", {}, participant)[1]
        team_accept = team_invite["invite_path"].replace("/join/", "/api/invites/") + "/accept"
        self.assertEqual(self.request("POST", team_accept, {}, judge_a)[0], 409)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/rubric", {"criteria": [
            {"code": "quality", "label": "Quality", "weight": 3, "min_score": 1, "max_score": 5},
            {"code": "impact", "label": "Impact", "weight": 1, "min_score": 1, "max_score": 5}]}, organizer)[0], 201)
        review_path = f"/api/assignments/{assignment_a}/review"
        self.assertEqual(self.request("PUT", review_path, {"scores": {"quality": 5}, "submit": True}, judge_a)[0], 422)
        self.assertEqual(self.request("PUT", review_path, {"scores": {"quality": 6, "impact": 1},
                                                          "submit": True}, judge_a)[0], 422)
        self.assertEqual(self.request("PUT", review_path, {"scores": {"quality": 5, "impact": 1},
                                                          "submit": True}, judge_a)[0], 200)
        for unauthorized in (judge_b, participant, organizer):
            self.assertEqual(self.request("PUT", review_path, {"scores": {"quality": 1, "impact": 1},
                                                                "submit": True}, unauthorized)[0], 403)
        scores_path = f"/api/judges/{ids['marek.nowak@example.org']}/scores"
        self.assertEqual(self.request("GET", scores_path, token=judge_a)[0], 200)
        self.assertEqual(self.request("GET", scores_path, token=judge_b)[0], 403)
        self.assertEqual(self.request("GET", scores_path, token=participant)[0], 403)
        self.assertEqual(self.request("GET", f"/api/events/{event_id}/progress", token=participant)[0], 403)
        self.assertEqual(self.request("GET", f"/api/events/{event_id}/results", token=participant)[0], 403)
        progress = self.request("GET", f"/api/events/{event_id}/progress", token=organizer)[1]
        self.assertEqual((progress["assigned"], progress["completed"], progress["pending"]), (2, 1, 1))
        preview = self.request("GET", f"/api/events/{event_id}/results", token=organizer)[1]["results"]
        self.assertAlmostEqual(preview[0]["raw_score"], 4)
        csv_text = self.request("GET", f"/api/events/{event_id}/export.csv", token=organizer)[1]
        self.assertEqual(next(csv.DictReader(io.StringIO(csv_text)))["title"], "'=SUM(1,2)")
        self.assertEqual(self.request("PATCH", f"/api/events/{event_id}", {
            "submissions_close": portal.iso(portal.now()-timedelta(minutes=1))}, organizer)[0], 200)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/publish", {}, organizer)[0], 200)
        gallery = self.request("GET", f"/events/{event_id}/projects")[1]
        self.assertIn("Published judging results", gallery)
        self.assertIn("Adjusted score", gallery)
        self.assertIn("4.000", gallery)
        public = self.request("GET", f"/api/events/{event_id}/results")[1]
        self.assertTrue(public["published"])
        self.assertAlmostEqual(public["results"][0]["adjusted_score"], preview[0]["adjusted_score"])
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/publish", {}, organizer)[0], 409)
        self.assertEqual(self.request("PUT", review_path, {"scores": {"quality": 1, "impact": 1},
                                                          "submit": True}, judge_a)[0], 409)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/rubric", {"criteria": [
            {"code": "other", "label": "Other", "weight": 1}]}, organizer)[0], 409)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/assignments", {
            "project_id": project_id, "judge_user_id": ids["participant@demo.local"]}, organizer)[0], 409)
        self.assertEqual(self.request("PATCH", f"/api/events/{event_id}", {
            "submissions_close": portal.iso(portal.now()+timedelta(days=1))}, organizer)[0], 409)
        published_csv = self.request("GET", f"/api/events/{event_id}/export.csv", token=organizer)[1]
        self.assertAlmostEqual(float(next(csv.DictReader(io.StringIO(published_csv)))["adjusted_score"]),
                               public["results"][0]["adjusted_score"])
        with portal.db() as conn:
            fixture_results = portal.calculate_results(conn, "evt_01")
        self.assertEqual(len(fixture_results), 41)
        self.assertTrue(all(math.isfinite(row["adjusted_score"]) for row in fixture_results
                            if row["adjusted_score"] is not None))

    def test_t2_normalization_handles_constant_judge_and_uneven_assignments(self):
        organizer = "dogfood-organizer-2026"
        event_id = self.new_event(tracks=["Open"])
        track_id = self.request("GET", f"/api/events/{event_id}")[1]["tracks"][0]["id"]
        participants = [("dogfood-participant-2026", None)]
        participants.extend((None, self.register()[1]) for _ in range(2))
        project_ids = []
        for index, (token, cookie) in enumerate(participants):
            team_id = self.request("POST", f"/api/events/{event_id}/teams",
                                   {"name": f"Normalization team {index}"}, token, cookie)[1]["id"]
            project_ids.append(self.request("POST", f"/api/events/{event_id}/projects", {
                "team_id": team_id, "track_id": track_id, "title": f"Project {index}",
                "submit": True}, token, cookie)[1]["id"])
        for email in ("marek.nowak@example.org", "priya.nair@example.org"):
            self.assertEqual(self.request("POST", f"/api/events/{event_id}/roles", {
                "email": email, "role": "judge"}, organizer)[0], 200)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/rubric", {"criteria": [
            {"code": "quality", "label": "Quality", "weight": 1}]}, organizer)[0], 201)
        judges = self.request("GET", f"/api/events/{event_id}/judges", token=organizer)[1]["judges"]
        ids = {judge["email"]: judge["id"] for judge in judges}
        score_plan = [(0, "marek.nowak@example.org", "dogfood-judge-a-2026", 5),
                      (1, "marek.nowak@example.org", "dogfood-judge-a-2026", 4),
                      (2, "marek.nowak@example.org", "dogfood-judge-a-2026", 3),
                      (0, "priya.nair@example.org", "dogfood-judge-b-2026", 1),
                      (1, "priya.nair@example.org", "dogfood-judge-b-2026", 1)]
        for project_index, email, token, value in score_plan:
            assignment_id = self.request("POST", f"/api/events/{event_id}/assignments", {
                "project_id": project_ids[project_index], "judge_user_id": ids[email]}, organizer)[1]["id"]
            self.assertEqual(self.request("PUT", f"/api/assignments/{assignment_id}/review", {
                "scores": {"quality": value}, "submit": True}, token)[0], 200)
        rows = self.request("GET", f"/api/events/{event_id}/results", token=organizer)[1]["results"]
        by_project = {row["project_id"]: row for row in rows}
        self.assertAlmostEqual(by_project[project_ids[0]]["raw_score"], 3)
        self.assertAlmostEqual(by_project[project_ids[1]]["raw_score"], 2.5)
        self.assertAlmostEqual(by_project[project_ids[2]]["raw_score"], 3)
        # Global mean is 2.8; A's mean is 4, B's constant score is 1.
        a_offset = (3 / 7) * (4 - 2.8)
        b_offset = (2 / 6) * (1 - 2.8)
        self.assertAlmostEqual(by_project[project_ids[0]]["adjusted_score"],
                               ((5 - a_offset) + (1 - b_offset)) / 2)
        self.assertAlmostEqual(by_project[project_ids[2]]["adjusted_score"], 3 - a_offset)
        self.assertTrue(all(math.isfinite(row["adjusted_score"]) for row in rows))

    def test_public_gallery_seed_and_closed_deadline(self):
        status, gallery, _ = self.request("GET", "/projects")
        self.assertEqual(status, 200)
        self.assertIn("Glass Signal", gallery)
        with portal.db() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM projects WHERE event_id='evt_01'").fetchone()[0], 41)
            self.assertEqual(conn.execute("SELECT duplicate_of FROM projects WHERE id='prj_41'").fetchone()[0], "prj_07")
        status, body, _ = self.request("POST", "/api/events/evt_01/projects", {}, "dogfood-participant-2026")
        self.assertEqual(status, 409)
        self.assertIn("deadline", body["error"].lower())

    def test_judge_isolation_and_export(self):
        status, data, _ = self.request("GET", "/api/judges/judge_jdg_08/scores", token="dogfood-judge-a-2026")
        self.assertEqual(status, 200)
        self.assertTrue(data["assignments"])
        assignment_id = data["assignments"][0]["assignment_id"]
        for token in ("dogfood-judge-b-2026", "dogfood-participant-2026"):
            self.assertEqual(self.request("GET", "/api/judges/judge_jdg_08/scores", token=token)[0], 403)
            self.assertEqual(self.request("PUT", f"/api/assignments/{assignment_id}/review",
                                          {"scores": {}, "submit": True}, token)[0], 403)
        self.assertEqual(self.request("GET", "/api/events/evt_01/export.csv", token="dogfood-judge-a-2026")[0], 403)
        status, csv, _ = self.request("GET", "/api/events/evt_01/export.csv", token="dogfood-organizer-2026")
        self.assertEqual(status, 200)
        self.assertIn("adjusted_score", csv.splitlines()[0])

    def test_invite_team_draft_submit_and_embargo(self):
        organizer = "dogfood-organizer-2026"
        starts = portal.iso(portal.now() - timedelta(hours=1))
        closes = portal.iso(portal.now() + timedelta(days=1))
        status, event, _ = self.request("POST", "/api/events", {
            "name": "Lifecycle test", "starts_at": starts, "submissions_close": closes,
            "tracks": ["Open tools"], "prizes": [{"title": "Overall"}]}, organizer)
        self.assertEqual(status, 201)
        event_id = event["id"]
        status, details, _ = self.request("GET", f"/api/events/{event_id}")
        self.assertEqual(status, 200)
        self.assertEqual(details["prizes"][0]["title"], "Overall")
        track_id = details["tracks"][0]["id"]
        status, invitation, _ = self.request("POST", f"/api/events/{event_id}/role-invites",
                                             {"email": "guest@example.org", "role": "participant"}, organizer)
        self.assertEqual(status, 201)
        self.assertEqual(self.request("GET", invitation["invite_path"])[0], 200)
        status, _, headers = self.request("POST", "/api/register", {
            "email": "guest@example.org", "name": "Guest Person", "password": "test-password-123"})
        self.assertEqual(status, 201)
        cookie = headers["Set-Cookie"].split(";", 1)[0]
        accept_path = invitation["invite_path"].replace("/role-invite/", "/api/role-invites/") + "/accept"
        status, accepted, _ = self.request("POST", accept_path, {}, cookie=cookie)
        self.assertEqual((status, accepted["role"]), (200, "participant"))
        self.assertEqual(self.request("POST", accept_path, {}, cookie=cookie)[0], 404)
        status, team, _ = self.request("POST", f"/api/events/{event_id}/teams", {"name": "Guest team"}, cookie=cookie)
        self.assertEqual(status, 201)
        status, team_invite, _ = self.request("POST", f"/api/teams/{team['id']}/invites", {}, cookie=cookie)
        self.assertEqual(status, 201)
        self.assertEqual(self.request("GET", team_invite["invite_path"])[0], 200)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/projects", {
            "team_id": team["id"], "track_id": track_id, "title": "Unsafe link",
            "repo_url": "javascript:alert(1)"}, cookie=cookie)[0], 422)
        status, project, _ = self.request("POST", f"/api/events/{event_id}/projects", {
            "team_id": team["id"], "track_id": track_id, "title": "First draft"}, cookie=cookie)
        self.assertEqual((status, project["status"]), (201, "draft"))
        self.assertEqual(self.request("GET", f"/api/projects/{project['id']}")[0], 403)
        self.assertEqual(self.request("PATCH", f"/api/projects/{project['id']}",
                                      {"title": "Final entry"}, cookie=cookie)[0], 200)
        self.assertEqual(self.request("POST", f"/api/projects/{project['id']}/submit", {}, cookie=cookie)[0], 200)
        self.assertIn("Final entry", self.request("GET", f"/events/{event_id}/projects")[1])
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/roles", {
            "email": "marek.nowak@example.org", "role": "judge"}, organizer)[0], 200)
        status, rubric, _ = self.request("POST", f"/api/events/{event_id}/rubric", {"criteria": [
            {"code": "quality", "label": "Quality", "weight": 2, "min_score": 1, "max_score": 5},
            {"code": "impact", "label": "Impact", "weight": 1, "min_score": 1, "max_score": 5},
        ]}, organizer)
        self.assertEqual(status, 201)
        status, assignment, _ = self.request("POST", f"/api/events/{event_id}/assignments", {
            "project_id": project["id"], "judge_user_id": "judge_jdg_08"}, organizer)
        self.assertEqual(status, 201)
        judge_token = "dogfood-judge-a-2026"
        status, review, _ = self.request("PUT", f"/api/assignments/{assignment['id']}/review", {
            "scores": {"quality": 4, "impact": 3}, "submit": True}, judge_token)
        self.assertEqual((status, review["status"]), (200, "submitted"))
        progress = self.request("GET", f"/api/events/{event_id}/progress", token=organizer)[1]
        self.assertEqual((progress["assigned"], progress["completed"]), (1, 1))
        results = self.request("GET", f"/api/events/{event_id}/results", token=organizer)[1]["results"]
        self.assertAlmostEqual(results[0]["raw_score"], 11 / 3)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/rubric", {"criteria": [
            {"code": "new", "label": "New", "weight": 1, "min_score": 1, "max_score": 5}
        ]}, organizer)[0], 201)
        judge_assignments = self.request("GET", "/api/judges/judge_jdg_08/scores", token=judge_token)[1]["assignments"]
        current = next(item for item in judge_assignments if item["assignment_id"] == assignment["id"])
        self.assertEqual({criterion["code"] for criterion in current["criteria"]}, {"quality", "impact"})
        self.assertEqual(self.request("GET", f"/api/events/{event_id}/results")[0], 403)
        self.assertEqual(self.request("GET", f"/api/events/{event_id}/results", token=organizer)[0], 200)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/publish", {}, organizer)[0], 409)
        self.assertEqual(self.request("PATCH", f"/api/events/{event_id}",
                                      {"submissions_close": portal.iso(portal.now() - timedelta(minutes=1))}, organizer)[0], 200)
        self.assertEqual(self.request("PATCH", f"/api/projects/{project['id']}",
                                      {"title": "Too late"}, cookie=cookie)[0], 409)
        self.assertEqual(self.request("POST", f"/api/events/{event_id}/publish", {}, organizer)[0], 200)
        self.assertEqual(self.request("GET", f"/api/events/{event_id}/results")[0], 200)


class BootstrapTests(unittest.TestCase):
    def test_non_demo_first_admin_bootstrap(self):
        original_path, original_mode = portal.DB_PATH, portal.DEMO_MODE
        original_email = os.environ.get("DOGFOOD_ADMIN_EMAIL")
        original_password = os.environ.get("DOGFOOD_ADMIN_PASSWORD")
        try:
            with tempfile.TemporaryDirectory() as directory:
                portal.DB_PATH = Path(directory) / "clean.sqlite3"
                portal.DEMO_MODE = False
                os.environ["DOGFOOD_ADMIN_EMAIL"] = "owner@example.org"
                os.environ["DOGFOOD_ADMIN_PASSWORD"] = "bootstrap-secret-123"
                portal.seed()
                portal.seed()
                with portal.db() as conn:
                    account = portal.user_by_email(conn, "owner@example.org")
                    self.assertEqual(account["is_admin"], 1)
                    self.assertTrue(portal.verify_password("bootstrap-secret-123", account["password_hash"]))
                    self.assertEqual(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0], 1)
        finally:
            portal.DB_PATH, portal.DEMO_MODE = original_path, original_mode
            for key, value in (("DOGFOOD_ADMIN_EMAIL", original_email),
                               ("DOGFOOD_ADMIN_PASSWORD", original_password)):
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value


if __name__ == "__main__":
    unittest.main()
