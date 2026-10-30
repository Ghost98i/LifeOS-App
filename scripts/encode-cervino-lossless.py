"""Derive smaller delivery assets without changing any Cervino pixel or source PNG."""
from pathlib import Path
from PIL import Image
import hashlib
import json

root = Path('assets/hero/alpine-day-cicle')
results = []
for source in sorted(root.glob('cervino-panorama-*.png')):
    original_bytes = source.read_bytes()
    with Image.open(source) as image:
        target = source.with_suffix('.webp')
        metadata = {key: image.info[key] for key in ('icc_profile', 'exif', 'xmp') if image.info.get(key)}
        image.save(target, 'WEBP', lossless=True, exact=True, method=6, **metadata)
        with Image.open(target) as decoded:
            assert image.size == decoded.size
            assert image.convert('RGBA').tobytes() == decoded.convert('RGBA').tobytes(), source.name
        assert source.read_bytes() == original_bytes
        results.append({'source': str(source), 'target': str(target), 'pngBytes': len(original_bytes), 'webpBytes': target.stat().st_size, 'size': image.size, 'sourceSHA256': hashlib.sha256(original_bytes).hexdigest(), 'identicalPixels': True})
Path('artifacts/optimization-2026-10-29/cervino-encoding.json').write_text(json.dumps(results, indent=2), encoding='utf8')
print(json.dumps({'scenes': len(results), 'pngBytes': sum(item['pngBytes'] for item in results), 'webpBytes': sum(item['webpBytes'] for item in results), 'identicalPixels': True}))
