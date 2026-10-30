"""Read-only Git snapshot: full base bundle + byte-exact dirty/untracked increment.

No checkout, staging, commit or extraction is performed. Existing packages are
never overwritten. Ignored build/dependency/old release directories are inventoried
but excluded; local .env files are included privately, without printing contents.
"""
import datetime
import hashlib
import json
import pathlib
import subprocess
import zipfile

root = pathlib.Path.cwd().resolve()
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
package = root / 'release' / f'consolidado-tandas-1-2-3-{stamp}'
package.mkdir(parents=True, exist_ok=False)
evidence = root / 'artifacts' / 'consolidacion-tres-tandas-20261029'
evidence.mkdir(parents=True, exist_ok=True)


def git(*args):
    return subprocess.check_output(['git', '-c', 'core.quotepath=false', *args], cwd=root, stderr=subprocess.PIPE)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def names(*args):
    return [p for p in git(*args).decode('utf-8').split('\0') if p]


tracked = names('ls-files', '--cached', '-z')
untracked = names('ls-files', '--others', '--exclude-standard', '-z')
dirty = set(names('diff', '--name-only', '-z', 'HEAD')) | set(untracked)
private = [p for p in ['.env', '.env.local', '.env.production', '.env.production.local'] if (root / p).is_file()]
dirty.update(private)
inventory = []
for name in sorted(set(tracked + untracked + private)):
    file = root / name
    assert not file.is_symlink(), f'Unexpected symlink: {name}'
    if file.is_file():
        data = file.read_bytes()
        inventory.append({'path': name, 'bytes': len(data), 'sha256': sha(data), 'increment': name in dirty})
    else:
        inventory.append({'path': name, 'deleted': True, 'increment': True})

manifest = {
    'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'head': git('rev-parse', 'HEAD').decode().strip(),
    'branch': git('branch', '--show-current').decode().strip(),
    'status': git('status', '--porcelain=v2', '--branch', '-uall').decode(),
    'ignored': names('ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'),
    'excludedIgnoredPolicy': 'node_modules, dist and old ignored release packages remain in place. Local env files are explicitly included. No personal cloud data was read.',
    'files': inventory,
}
(package / 'source-state.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
(package / 'working.patch').write_bytes(git('diff', '--binary', 'HEAD'))
(package / 'staged.patch').write_bytes(git('diff', '--cached', '--binary'))
(package / 'git-index.snapshot').write_bytes((root / '.git' / 'index').read_bytes())
subprocess.run(['git', 'bundle', 'create', str(package / 'base.bundle'), '--all'], check=True, cwd=root, capture_output=True)
subprocess.run(['git', 'bundle', 'verify', str(package / 'base.bundle')], check=True, cwd=root, capture_output=True)
archive = package / 'increment.zip'
with zipfile.ZipFile(archive, mode='x', compression=zipfile.ZIP_DEFLATED, compresslevel=3, allowZip64=True, strict_timestamps=False) as z:
    for entry in inventory:
        if entry.get('increment') and not entry.get('deleted'):
            z.write(root / entry['path'], 'files/' + entry['path'])
    z.writestr('source-state.json', json.dumps(manifest, indent=2, ensure_ascii=False))
with zipfile.ZipFile(archive) as z:
    for entry in inventory:
        if entry.get('increment') and not entry.get('deleted'):
            assert sha(z.read('files/' + entry['path'])) == entry['sha256'], entry['path']
    assert z.testzip() is None
for entry in inventory:
    if not entry.get('deleted'):
        assert sha((root / entry['path']).read_bytes()) == entry['sha256'], f'Changed during snapshot: {entry["path"]}'
checksums = {p.name: {'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())}
             for p in package.iterdir() if p.is_file()}
(package / 'backup-checksums.json').write_text(json.dumps(checksums, indent=2), encoding='utf-8')
result = {'package': str(package), 'tracked': len(tracked), 'untracked': len(untracked),
          'incrementFiles': sum(p['increment'] for p in inventory), 'totalFiles': len(inventory),
          'archiveBytes': archive.stat().st_size, 'verified': True, 'baseBundleVerified': True}
(evidence / 'backup.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
