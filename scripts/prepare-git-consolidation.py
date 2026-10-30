"""Inventory and prepare explicit Git path lists. Never stages or commits files.

Reports contain paths, sizes, hashes and finding types, never matched secrets.
The private reports belong in ignored artifacts/git-organizacion-20261029/.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path.cwd().resolve()
OUT = ROOT / 'artifacts/git-organizacion-20261029'
FIXTURE = 'release/published-observation-20261023/assets_index-ExwrnwAV.js'
FIXTURE_SHA = '9587d33cf2ca848461ee384e882598700f65233554808a7f647e4ad2bc1cbb10'
GENERATED_TRACKED = {'LifeOS.html', 'MANIFEST.sha256', 'das'}
ROOT_FILES = {'.env.example', '.firebaserc', '.gitignore', 'README.md', 'DEPLOY.md',
              'bun.lock', 'eslint.config.js', 'firebase-applet-config.json',
              'firebase.gym-emulator.json', 'firebase.json', 'firestore.rules',
              'index.html', 'metadata.json', 'package.json', 'package-lock.json',
              'tsconfig.json', 'vite.config.ts'}
PATTERNS = {
    'private-key-pem': rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----',
    'service-account-private-key': rb'"private_key"\s*:\s*"[^"\r\n]{30,}',
    'oauth-refresh-token': rb'"refresh_token"\s*:\s*"(?!\[|REDACTED|redacted|example)[^"\r\n]{20,}',
    'github-token': rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b',
    'google-access-token': rb'\bya29\.[A-Za-z0-9_-]{30,}',
    'aws-access-key': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'provider-secret-key': rb'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}',
}


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, stderr=subprocess.PIPE)


def names(*args):
    return [x for x in git(*args).decode().split('\0') if x]


def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def write(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf-8')


def category(name):
    if name in GENERATED_TRACKED:
        return 'generated-already-tracked'
    if name == FIXTURE:
        return 'public-compatibility-fixture'
    if name.startswith('src/'):
        if re.search(r'\.test\.tsx?$', name):
            return 'tests'
        if name.startswith(('src/assets/', 'src/styles/')):
            return 'app-resources'
        return 'application-source'
    if name.startswith(('assets/', 'public/')):
        return 'app-resources'
    if name.startswith('scripts/'):
        return 'development-tools'
    if name.startswith('docs/') or name in {'README.md', 'DEPLOY.md'}:
        return 'technical-documentation'
    if name in ROOT_FILES or name.startswith('.github/'):
        return 'project-configuration'
    if name.startswith(('artifacts/', 'release/', 'deploy-', 'lifeos-')) or name.endswith('.zip'):
        return 'local-evidence-backups-builds'
    if name.startswith(('.agent/', '.agents/')) or name == 'skills-lock.json':
        return 'local-installed-skills'
    if name.startswith(('node_modules/', 'dist/', '.firebase/')) or name.endswith(('-debug.log', '.tsbuildinfo')):
        return 'generated-runtime'
    if re.search(r'(^|/)\.env', name) or re.search(r'\.(pem|key|p12|pfx|jks|keystore)$', name, re.I):
        return 'private-local'
    return 'review-required'


VERSIONED = {'application-source', 'app-resources', 'tests', 'development-tools',
             'technical-documentation', 'project-configuration', 'public-compatibility-fixture'}


def scan_bytes(data, label):
    if b'\x00' in data[:4096]:
        return []
    result = []
    for kind, pattern in PATTERNS.items():
        for match in re.finditer(pattern, data):
            result.append({'file': label, 'kind': kind, 'line': data.count(b'\n', 0, match.start()) + 1})
    return result


def inventory():
    OUT.mkdir(parents=True, exist_ok=True)
    snapshot = OUT / 'initial.json'
    if not snapshot.exists():
        tracked = names('ls-files', '--cached', '-z')
        others = names('ls-files', '--others', '--exclude-standard', '-z')
        before = {'head': git('rev-parse', 'HEAD').decode().strip(),
                  'branch': git('branch', '--show-current').decode().strip(),
                  'indexSha256': digest(ROOT / '.git/index'),
                  'status': git('status', '--porcelain=v2', '--branch', '-uall').decode(),
                  'tracked': tracked, 'untracked': others,
                  'files': [{'path': p, 'sha256': digest(ROOT / p)} for p in sorted(set(tracked + others)) if (ROOT / p).is_file()]}
        write('initial.json', before)
        (OUT / 'gitignore.before').write_bytes((ROOT / '.gitignore').read_bytes())
        # This remains a private inventory, not a shared diff or credential dump.
        write('ignored-before.json', names('ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'))
    tracked = names('ls-files', '--cached', '-z')
    others = names('ls-files', '--others', '--exclude-standard', '-z')
    ignored = names('ls-files', '--others', '--ignored', '--exclude-standard', '-z')
    tracked_set, ignored_set = set(tracked), set(ignored)
    entries = []
    for name in sorted(set(tracked + others + ignored + [FIXTURE])):
        group = category(name)
        if name in ignored_set and group not in VERSIONED:
            entries.append({'path': name, 'category': group, 'bytes': None, 'tracked': False, 'ignored': True})
            continue
        p = ROOT / name
        if not p.is_file():
            entries.append({'path': name, 'category': category(name), 'deleted': True})
            continue
        entries.append({'path': name, 'category': category(name), 'bytes': p.stat().st_size,
                        'tracked': name in tracked_set, 'ignored': name in ignored_set})
    totals = {}
    for entry in entries:
        item = totals.setdefault(entry['category'], {'files': 0, 'measuredBytes': 0, 'tracked': 0, 'ignored': 0})
        item['files'] += 1
        item['measuredBytes'] += entry.get('bytes') or 0
        item['tracked'] += bool(entry.get('tracked'))
        item['ignored'] += bool(entry.get('ignored'))
    write('inventory.json', {'totals': totals, 'entries': entries})
    wanted = [e['path'] for e in entries if e['category'] in VERSIONED and not e.get('deleted')]
    missing_tracked = [p for p in tracked if p not in wanted and p not in GENERATED_TRACKED]
    assert not missing_tracked, f'Unclassified tracked files: {missing_tracked}'
    assert digest(ROOT / FIXTURE) == FIXTURE_SHA
    assert not any(p.startswith(('artifacts/', '.agent/', '.agents/')) or '/.env' in p or (p.startswith('.env') and p != '.env.example') for p in wanted)
    ignored_candidates = subprocess.run(['git', 'check-ignore', '--no-index', '--stdin', '-z'], input=b''.join(p.encode() + b'\0' for p in wanted), capture_output=True)
    assert ignored_candidates.returncode in (0, 1)
    ignored_names = [p for p in ignored_candidates.stdout.decode().split('\0') if p]
    existing_ignore_exception = [p for p in ignored_names if p == 'assets/.aistudio/.gitignore' and p in tracked_set]
    ignored_names = [p for p in ignored_names if p not in existing_ignore_exception]
    additions = sorted(set(wanted) - set(tracked))
    fingerprints = [{'path': p, 'sha256': digest(ROOT / p), 'bytes': (ROOT / p).stat().st_size} for p in wanted]
    findings = []
    for p in wanted:
        if (ROOT / p).stat().st_size <= 25 * 1024 * 1024:
            findings += scan_bytes((ROOT / p).read_bytes(), p)
    env_names = []
    if (ROOT / '.env').exists():
        env_names = re.findall(r'^([A-Za-z_][A-Za-z_0-9]*)=', (ROOT / '.env').read_text(encoding='utf-8-sig'), re.M)
    write('secret-scan.json', {'findings': findings, 'envVariableNamesOnly': env_names,
                              'noSecretValuesWritten': True, 'scope': 'Exact future versioned file set; binary files skipped. Pattern detection, not proof of absence.'})
    (OUT / 'versionar.txt').write_text('\n'.join(wanted) + '\n', encoding='utf-8')
    (OUT / 'versionar.paths0').write_bytes(b''.join(p.encode() + b'\0' for p in wanted))
    (OUT / 'nuevos-versionables.txt').write_text('\n'.join(additions) + '\n', encoding='utf-8')
    (OUT / 'retirar-solo-indice.txt').write_text('\n'.join(sorted(GENERATED_TRACKED)) + '\n', encoding='utf-8')
    (OUT / 'retirar-solo-indice.paths0').write_bytes(b''.join(p.encode() + b'\0' for p in sorted(GENERATED_TRACKED)))
    excluded = [e for e in entries if e['category'] not in VERSIONED]
    write('excluir.json', excluded)
    write('versionar-hashes.json', fingerprints)
    write('plan-summary.json', {'versionedTreeFiles': len(wanted), 'newFilesToVersion': len(additions),
                               'indexOnlyRemovals': sorted(GENERATED_TRACKED), 'ignoredVersionablePaths': ignored_names,
                               'alreadyTrackedIgnoreException': existing_ignore_exception,
                               'secretFindings': len(findings), 'totals': totals})
    print(json.dumps({'versionedTreeFiles': len(wanted), 'newFilesToVersion': len(additions),
                      'ignoredVersionablePaths': ignored_names, 'secretFindings': len(findings), 'totals': totals}, indent=2))


def history_scan():
    objects = git('rev-list', '--objects', '--all').decode().splitlines()
    blobs = []
    process = subprocess.Popen(['git', 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    findings = []
    for obj in objects:
        oid, _, name = obj.partition(' ')
        if not name or name.endswith(('.png', '.webp', '.jpg', '.woff2', '.zip', '.lottie', '.wasm')):
            continue
        process.stdin.write((oid + '\n').encode()); process.stdin.flush()
        header = process.stdout.readline().decode().strip().split()
        size = int(header[2]); data = process.stdout.read(size); process.stdout.read(1)
        if header[1] != 'blob':
            continue
        blobs.append(oid)
        for entry in scan_bytes(data, name):
            entry['object'] = oid; findings.append(entry)
    process.stdin.close(); process.stdout.close(); process.wait()
    write('history-secret-scan.json', {'reachableCommits': int(git('rev-list', '--count', '--all')), 'textBlobsScanned': len(blobs), 'findings': findings, 'noSecretValuesWritten': True, 'scope': 'Locally reachable history, no remote fetch, no binary archives, signatures only.'})
    print(json.dumps({'historyTextBlobsScanned': len(blobs), 'findings': len(findings)}))


def check():
    before = json.loads((OUT / 'initial.json').read_text(encoding='utf-8'))
    assert git('rev-parse', 'HEAD').decode().strip() == before['head']
    assert digest(ROOT / '.git/index') == before['indexSha256'], 'Index changed'
    assert git('branch', '--show-current').decode().strip() == before['branch']
    for entry in before['files']:
        if entry['path'] not in {'.gitignore', 'scripts/prepare-git-consolidation.py', 'artifacts/git-inventory-initial.log', 'artifacts/git-history-scan.log'} and not entry['path'].startswith('artifacts/git-organizacion-20261029/'):
            assert digest(ROOT / entry['path']) == entry['sha256'], f'Original work changed: {entry["path"]}'
    for entry in json.loads((OUT / 'versionar-hashes.json').read_text(encoding='utf-8')):
        assert digest(ROOT / entry['path']) == entry['sha256'], entry['path']
    assert not json.loads((OUT / 'plan-summary.json').read_text())['ignoredVersionablePaths']
    assert not json.loads((OUT / 'secret-scan.json').read_text())['findings']
    assert not json.loads((OUT / 'history-secret-scan.json').read_text())['findings']
    print('PASS: original work preserved (except approved .gitignore), exact allowlist hashes, HEAD/branch/index unchanged, no ignored versionable path or detected secret signature.')


if __name__ == '__main__':
    if len(sys.argv) != 2 or sys.argv[1] not in {'inventory', 'history-scan', 'check'}:
        raise SystemExit('Usage: python scripts/prepare-git-consolidation.py inventory|history-scan|check')
    {'inventory': inventory, 'history-scan': history_scan, 'check': check}[sys.argv[1]]()
