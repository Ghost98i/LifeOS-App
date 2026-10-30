"""Arrange unchanged browser captures for visual inspection and before/after delivery."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path('artifacts/refinamiento-tanda-1')
for phase in ['before', 'after']:
    for view in ['agenda', 'trabajo', 'reventa']:
        for theme in ['light', 'dark']:
            tiles = []
            for width in [1440, 768, 390]:
                for state in ['empty', 'filled']:
                    source = root / phase / f'{view}-{state}-{theme}-{width}.png'
                    img = Image.open(source).convert('RGB')
                    img.thumbnail((600, 900))
                    tile = Image.new('RGB', (620, 940), '#cbd5e1')
                    ImageDraw.Draw(tile).text((10, 8), f'{phase} | {view} | {theme} | {width} | {state}', fill='#111827')
                    tile.paste(img, (10, 32))
                    tiles.append(tile)
            sheet = Image.new('RGB', (1860, 1880), '#cbd5e1')
            for index, tile in enumerate(tiles):
                sheet.paste(tile, ((index // 2) * 620, (index % 2) * 940))
            sheet.save(root / phase / f'contact-{view}-{theme}.jpg')

for view, state, crop_height in [('reventa', 'empty', 540), ('agenda', 'filled', 700), ('trabajo', 'filled', 820)]:
    row_height = crop_height + 40
    sheet = Image.new('RGB', (1440, row_height * 2), '#e2e8f0')
    draw = ImageDraw.Draw(sheet)
    for index, phase in enumerate(['before', 'after']):
        picture = Image.open(root / phase / f'{view}-{state}-light-1440.png').convert('RGB')
        picture = picture.crop((0, 0, 1440, min(picture.height, crop_height)))
        draw.text((24, index * row_height + 12), 'ANTES' if phase == 'before' else 'DESPUES', fill='#111827')
        sheet.paste(picture, (0, index * row_height + 40))
    sheet.save(root / f'comparacion-{view}.jpg')
