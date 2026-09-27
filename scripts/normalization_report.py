"""Reproduce fixture scores using the production scorer in a temporary database."""
import argparse
import csv
import importlib.util
import io
import math
import tempfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("dogfood", ROOT / "src/dogfood.py")
portal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portal)


def report():
    with tempfile.TemporaryDirectory() as directory:
        portal.DB_PATH = Path(directory) / "evidence.sqlite3"
        portal.DEMO_MODE = True
        portal.seed()
        with portal.db() as conn:
            rows = portal.calculate_results(conn, "evt_01")
            reviews = portal.score_rows(conn, "evt_01")
            tracks = dict(conn.execute("SELECT id,name FROM tracks WHERE event_id='evt_01'"))
    ranks = {}
    for metric in ("raw_score", "adjusted_score"):
        for row in rows:
            value = row[metric]
            ranks[row["project_id"], metric] = None if value is None else 1 + sum(
                other[metric] is not None and round(other[metric], 12) > round(value, 12)
                for other in rows if other["track_id"] == row["track_id"])
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["project_id", "title", "track", "reviews", "raw_score", "adjusted_score", "raw_rank", "adjusted_rank", "duplicate_of"])
    for row in sorted(rows, key=lambda r:r["project_id"]):
        writer.writerow([row["project_id"],row["title"],tracks[row["track_id"]],row["review_count"],
                         *["" if row[m] is None else f"{row[m]:.9f}" for m in ("raw_score","adjusted_score")],
                         ranks[row["project_id"],"raw_score"],ranks[row["project_id"],"adjusted_score"],row["duplicate_of"]])
    groups = defaultdict(list)
    for review in reviews:
        groups[review["judge_user_id"],review["track_id"]].append(review["raw"])
    constant = [g for g, scores in groups.items() if len(scores)>1 and len(set(scores))==1]
    scored = [r for r in rows if r["adjusted_score"] is not None]
    assert len(rows)==41, len(rows)
    assert all(math.isfinite(r["adjusted_score"]) and 1 <= r["adjusted_score"] <= 5 for r in scored)
    assert next(r for r in rows if r["project_id"]=="prj_41")["adjusted_score"] is None
    changed = sum(ranks[r["project_id"],"raw_score"] != ranks[r["project_id"],"adjusted_score"] for r in scored)
    summary = (f"41 project rows; {len(scored)} scored; {len(reviews)} eligible submitted reviews.\n"
               f"Review coverage per scored project: {min(r['review_count'] for r in scored)} to {max(r['review_count'] for r in scored)}.\n"
               f"{changed} projects change within-track rank (ties share rank).\n"
               f"{len(constant)} judge/track groups have multiple identical raw scores.\n"
               "Duplicate prj_41 retained with no score; all scored results finite and within [1,5].\n")
    return output.getvalue(), summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Fail if committed evidence differs")
    args = parser.parse_args()
    contents, summary = report()
    target = ROOT / "docs/normalization-fixtures.csv"
    if args.check:
        if not target.exists() or target.read_text(encoding="utf-8") != contents:
            raise SystemExit("Normalization evidence is stale; regenerate it.")
    else:
        target.parent.mkdir(exist_ok=True)
        target.write_text(contents, encoding="utf-8", newline="")
    print(summary, end="")
