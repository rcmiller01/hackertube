"""Replay only the new regressions against an isolated exact-head archive."""
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[3]
HEAD = 'e26104cbd9c9a2b84d25272709f2ff6eabcb2c1c'
OUT = Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='ht-pr17-pinned-') as temp:
    target = Path(temp).resolve()
    archive = subprocess.check_output(['git', 'archive', HEAD], cwd=ROOT)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tree:
        tree.extractall(target, filter='data')
    for name in ['test_pr17_review.py', 'test_dashboard_page.js']:
        shutil.copy2(ROOT / 'tests' / name, target / 'tests' / name)
    (target / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
    code = f"""import sys
from pathlib import Path
root = Path({str(target)!r})
sys.path[:0] = [str(root / 'hackertube'), str(root / 'tests'), str(root)]
import hackertube_core
assert Path(hackertube_core.__file__).resolve().is_relative_to(root), hackertube_core.__file__
print('Pinned runtime import: verified inside exact-head archive', flush=True)
import pytest
raise SystemExit(pytest.main(['tests/test_pr17_review.py', '-q']))
"""
    py = subprocess.run([sys.executable, '-I', '-c', code], cwd=target, text=True, capture_output=True)
    js = subprocess.run(['node', '--test', '--test-name-pattern=beginner search does not claim',
                         'tests/test_dashboard_page.js'], cwd=target, text=True, capture_output=True)
    (OUT / 'pinned-python-red.log').write_text(py.stdout + py.stderr)
    (OUT / 'pinned-node-red.log').write_text(js.stdout + js.stderr)
    receipt = {'reviewed_head': HEAD, 'python_exit': py.returncode, 'node_exit': js.returncode,
               'runtime_import_isolated': 'Pinned runtime import: verified' in py.stdout}
    (OUT / 'pinned-repro.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))
    assert py.returncode == js.returncode == 1 and receipt['runtime_import_isolated']
