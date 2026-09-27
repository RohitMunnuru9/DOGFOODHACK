"""Compare a seeded running portal with the host fixture, independently of its scorer.

Run against a demo/test instance before modifying its historical fixture event.
This supplements, and does not replace or modify, the host's run.py.
"""

import argparse
import csv
import html
import io
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def verify(base, fixture, organizer_header):
    def get(path, auth=None):
        headers = {}
        if auth:
            name, value = auth.split(":", 1)
            headers[name.strip()] = value.strip()
        try:
            response = urlopen(Request(base.rstrip("/") + path, headers=headers), timeout=15)
        except HTTPError as error:
            response = error
        with response:
            return response.status, response.read().decode("utf-8")

    event_id = fixture["event"]["id"]
    event_path = "/api/events/" + event_id
    status, body = get(event_path + "/export.json", organizer_header)
    assert status == 200, ("archive status", status)
    archive = json.loads(body)
    for key, value in fixture["event"].items():
        assert archive["event"][key] == value, ("event", key)
    assert {r["id"]: r["name"] for r in archive["tracks"]} == {
        r["id"]: r["name"] for r in fixture["tracks"]}
    users = {u["id"]: u for u in archive["users"]}
    by_email = {u["email"]: u for u in archive["users"]}
    roles = {(r["user_id"], r["role"]) for r in archive["event_roles"]}
    scopes = {r["user_id"]: json.loads(r["track_ids"]) for r in archive["judge_track_scopes"]}
    judge_ids = {}
    for judge in fixture["judges"]:
        user = by_email[judge["email"]]
        assert user["name"] == judge["name"]
        assert (user["id"], "judge") in roles
        assert set(scopes[user["id"]]) == set(judge["tracks"])
        judge_ids[judge["id"]] = user["id"]
    members = defaultdict(set)
    for member in archive["team_members"]:
        members[member["team_id"]].add(users[member["user_id"]]["email"])
    assert {t["id"]: t["name"] for t in archive["teams"]} == {
        t["id"]: t["name"] for t in fixture["teams"]}
    for team in fixture["teams"]:
        assert members[team["id"]] == set(team["members"])

    projects = {p["id"]: p for p in archive["projects"]}
    assert set(projects) == {p["id"] for p in fixture["projects"]}
    duplicates, seen = {}, {}
    for project in fixture["projects"]:
        stored = projects[project["id"]]
        for key, value in project.items():
            assert stored[{"team": "team_id", "track": "track_id"}.get(key, key)] == value, (project["id"], key)
        fingerprint = (project["team"], project["title"].casefold(), project["repo_url"])
        duplicates[project["id"]] = seen.get(fingerprint)
        seen.setdefault(fingerprint, project["id"])
        assert stored["duplicate_of"] == duplicates[project["id"]]
        assert stored["status"] == "submitted"
        assert stored["source_fixture_id"] == project["id"]
        status, detail = get("/projects/" + project["id"])
        assert status == 200 and project["title"] in html.unescape(detail), (project["id"], "public detail")

    assignments = {a["id"]: a for a in archive["assignments"]}
    criteria = {c["id"]: c["code"] for c in archive["criteria"]}
    values = defaultdict(dict)
    for score in archive["criterion_scores"]:
        values[score["review_id"]][criteria[score["criterion_id"]]] = score["value"]
    stored_scores = {}
    for review in archive["reviews"]:
        assignment = assignments[review["assignment_id"]]
        key = (assignment["judge_user_id"], assignment["project_id"])
        assert key not in stored_scores
        assert review["status"] == "submitted"
        stored_scores[key] = (values[review["id"]], review["comment"])
    expected_scores = {
        (judge_ids[s["judge"]], s["project"]): (s["criteria"], s.get("comment", ""))
        for s in fixture["scores"]}
    assert len(expected_scores) == len(fixture["scores"]), "Reference now has repeated judge/project pairs; review importer policy"
    assert stored_scores == expected_scores, "Every criterion and comment must survive import"

    # Independent oracle from the downloaded input and documented formula.
    # Deliberately does not import any application scoring functions.
    track_reviews = defaultdict(list)
    judge_reviews = defaultdict(list)
    for score in fixture["scores"]:
        if duplicates[score["project"]]:
            continue
        track = projects[score["project"]]["track_id"]
        raw = statistics.mean(score["criteria"].values())
        track_reviews[track].append((score, raw))
        judge_reviews[track, score["judge"]].append(raw)
    expected_results = defaultdict(list)
    for track, reviews in track_reviews.items():
        track_mean = statistics.mean(raw for _, raw in reviews)
        for score, raw in reviews:
            judge_values = judge_reviews[track, score["judge"]]
            offset = len(judge_values) / (len(judge_values) + 4) * (statistics.mean(judge_values) - track_mean)
            expected_results[score["project"]].append((raw, max(1, min(5, raw - offset))))
    status, body = get(event_path + "/export.csv", organizer_header)
    assert status == 200
    rows = list(csv.DictReader(io.StringIO(body)))
    assert len(rows) == len(projects)
    assert {row["project_id"] for row in rows} == set(projects)
    for row in rows:
        pid = row["project_id"]
        expected = expected_results[pid]
        assert row["title"] == projects[pid]["title"]
        assert row["track_id"] == projects[pid]["track_id"]
        assert row["duplicate_of"] == (duplicates[pid] or "")
        assert int(row["review_count"]) == len(expected)
        assert row["method"] == "judge-mean-shrinkage-v1"
        for index, metric in enumerate(("raw_score", "adjusted_score")):
            if not expected:
                assert row[metric] == "", (pid, metric)
            else:
                actual = float(row[metric])
                assert math.isfinite(actual) and 1 <= actual <= 5
                assert math.isclose(actual, statistics.mean(s[index] for s in expected), rel_tol=0, abs_tol=1e-12), (pid, metric)
    assert get(event_path + "/export.csv")[0] in (401, 403)
    assert get(event_path + "/export.json")[0] in (401, 403)
    completed = {r["assignment_id"] for r in archive["reviews"]}
    pending = sum(a["id"] not in completed for a in assignments.values())
    constant = sum(len(scores) > 1 and len(set(scores)) == 1 for scores in judge_reviews.values())
    coverage = [len(reviews) for reviews in expected_results.values() if reviews]
    print(f"PASS: {len(fixture['tracks'])} tracks, {len(judge_ids)} judges/scopes, {len(members)} teams and all memberships match.")
    print(f"PASS: All {len(projects)} submissions preserve fixture fields and have public detail pages.")
    print(f"PASS: All {len(stored_scores)} reviews, {len(archive['criterion_scores'])} criterion values and comments match.")
    print(f"PASS: {len(rows)} CSV rows match independent calculations; {sum(coverage)} eligible reviews, coverage {min(coverage)}-{max(coverage)}.")
    print(f"PASS: {sum(bool(d) for d in duplicates.values())} duplicate retained without scores; {pending} pending assignments have no fabricated reviews.")
    print(f"PASS: {constant} constant-score judge/track group handled without nonfinite results.")
    print("PASS: Historical deadline preserved; anonymous CSV and full-archive exports refused.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--fixtures", type=Path, default=Path(__file__).resolve().parents[1] / "fixtures.json")
    parser.add_argument("--organizer-header", default="Authorization: Bearer dogfood-organizer-2026")
    args = parser.parse_args()
    verify(args.base_url, json.loads(args.fixtures.read_text(encoding="utf-8")), args.organizer_header)
