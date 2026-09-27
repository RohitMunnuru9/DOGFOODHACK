"""Run the unmodified host checker and fail the shell if any check failed."""
import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--base-url', help='Optional local port override; recorded honestly in the receipt')
parser.add_argument('--output', default='acceptance-report.txt')
args = parser.parse_args()
config = (ROOT / '.dogfood.toml').read_text(encoding='utf-8')
if args.base_url:
    if not re.fullmatch(r'https?://[A-Za-z0-9.:[\]-]+', args.base_url):
        raise SystemExit('Use an HTTP(S) origin without a path')
    config = re.sub(r'base_url\s*=\s*"[^"]+"', f'base_url = "{args.base_url}"', config)
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / '.dogfood.toml'
    path.write_text(config, encoding='utf-8')
    result = subprocess.run([sys.executable, str(ROOT/'run.py'), str(path), '--fixtures', 'fixtures.json'],
                            cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
receipt = result.stdout
(ROOT / args.output).write_text(receipt, encoding='utf-8')
print(receipt, end='')
if result.stderr:
    print(result.stderr, file=sys.stderr, end='')
if result.returncode or len(re.findall(r'^T[12].*\bPASS$', receipt, re.M)) != 7 or re.search(r'\bFAIL\b', receipt):
    raise SystemExit(1)
