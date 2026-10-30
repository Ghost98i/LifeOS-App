"""Contact sheets for inspection only; original browser captures stay intact."""
from pathlib import Path
from PIL import Image, ImageDraw
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts/integral/browser')
labels = ['Hoy', 'Gimnasio', 'Finanzas', 'Agenda', 'Calendario', 'Trabajo', 'Mi negocio', 'Estudios', 'Notas', 'IA', 'Configuracion']
for populated in ['datos', 'vacio']:
    for width, height in [(1920, 1080), (2560, 1440), (768, 1024), (375, 812)]:
        for theme in ['light', 'dark']:
            files = sorted(root.glob(f'{populated}-{width}-{theme}-[0-9][0-9].png'))
            if not files:
                continue
            groups = [files[i:i + 4] for i in range(0, len(files), 4)] if width <= 768 else [files]
            for number, group in enumerate(groups):
                columns = 2 if width <= 768 else 3
                tile_width = width if width == 375 else 384 if width == 768 else 640
                tile_height = round(height * tile_width / width)
                sheet = Image.new('RGB', (columns * tile_width, ((len(group) + columns - 1) // columns) * (tile_height + 28)), '#b5bac6')
                draw = ImageDraw.Draw(sheet)
                for index, file in enumerate(group):
                    picture = Image.open(file).convert('RGB').crop((0, 0, width, height))
                    picture = picture.resize((tile_width, tile_height))
                    left = index % columns * tile_width
                    top = index // columns * (tile_height + 28)
                    draw.text((left + 8, top + 7), f'{labels[int(file.stem[-2:])]} | {width} | {theme} | {populated}', fill='black')
                    sheet.paste(picture, (left, top + 28))
                sheet.save(root / f'contact-{populated}-{width}-{theme}-{number}.png')
