"""Run supplementary T3/T4 regressions; the host checker has no such probes."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEST_FILE = ROOT / "tests" / "test_portal.py"
REPORT_FILE = ROOT / "tier-regression-report.txt"
CASES = {
    "T3": (
        "test_voting_policy_requires_email_bound_single_use_invitation",
        "test_t3_ballot_comments_privacy_and_abuse_controls",
    ),
    "T4": (
        "test_t4_signed_webhook_delivery",
        "test_t4_archive_records_and_embeddable_gallery",
        "test_full_archive_restores_fixture_history_and_locked_identities",
        "test_large_archive_roundtrip_and_matching_export_limits",
    ),
}


class RecordingResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.passed = set()

    def addSuccess(self, test):
        self.passed.add(test._testMethodName)
        super().addSuccess(test)


def main() -> int:
    spec = importlib.util.spec_from_file_location("portal_regressions", TEST_FILE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    suite = unittest.TestSuite(
        module.PortalTests(name)
        for names in CASES.values()
        for name in names
    )
    output = io.StringIO()
    with contextlib.redirect_stderr(io.StringIO()):
        result = unittest.TextTestRunner(
            stream=output, verbosity=1, resultclass=RecordingResult
        ).run(suite)

    lines = [
        "DOGFOOD supplementary T3/T4 regression report",
        "These are project tests, not checks in the published run.py.",
        "",
    ]
    for tier, names in CASES.items():
        for name in names:
            lines.append(f"{tier}  {name} ... {'PASS' if name in result.passed else 'FAIL'}")
        passed = sum(name in result.passed for name in names)
        lines.append(f"{tier}  {passed}/{len(names)} passed")
        lines.append("")
    if not result.wasSuccessful():
        lines.extend(("Failure details:", output.getvalue().strip(), ""))
    report = "\n".join(lines).rstrip() + "\n"
    REPORT_FILE.write_text(report, encoding="utf-8")
    print(report, end="")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
