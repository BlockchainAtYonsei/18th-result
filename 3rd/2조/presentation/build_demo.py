#!/usr/bin/env python3
"""Bundle the actual FE offline entry, then embed it and the JSON into index.html."""
from pathlib import Path
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]

def run(*args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, **kwargs)

run('docker', 'compose', '-f', 'compose.dev.yaml', 'exec', '-T', 'frontend', 'pnpm', 'exec', 'vite', 'build', '--mode', 'presentation', '--outDir', '/tmp/scl-offline-demo')
container = run('docker', 'compose', '-f', 'compose.dev.yaml', 'ps', '-q', 'frontend', capture_output=True, text=True).stdout.strip()
if not container:
    raise SystemExit('Start the frontend development container first')
for source, target in [('offline-demo.js', 'offline-demo.js'), ('solana-compliance-lab-frontend.css', 'offline-demo.css')]:
    run('docker', 'cp', f'{container}:/tmp/scl-offline-demo/{source}', str(ROOT/'presentation/vendor'/target))
run(sys.executable, 'presentation/build.py')
