from pathlib import Path
from PIL import Image, ImageDraw

root=Path('artifacts/refinamiento-tanda-2')
screens=[('finanzas','movimientos'),('finanzas','cuentas'),('finanzas','analisis'),('finanzas','proyeccion'),('config','account')]
sizes=[(1920,1080),(2560,1440),(768,1024),(390,844)]
for phase in ['before','after']:
    for view,tab in screens:
        for theme in ['light','dark']:
            sheet=Image.new('RGB',(1920,2730),'#cbd5e1')
            draw=ImageDraw.Draw(sheet)
            for col,(width,height) in enumerate(sizes):
                for row,state in enumerate(['empty','filled','error']):
                    file=root/phase/f'{view}-{tab}-{state}-{theme}-{width}.png'
                    img=Image.open(file).convert('RGB').crop((0,0,width,height))
                    img.thumbnail((460,844))
                    x,y=col*480,row*910
                    draw.text((x+8,y+8),f'{view}/{tab} | {width} | {theme} | {state}',fill='#111827')
                    sheet.paste(img,(x+8,y+36))
            sheet.save(root/phase/f'contact-{view}-{tab}-{theme}.jpg')

for view,tab in [('finanzas','analisis'),('config','account')]:
    sheet=Image.new('RGB',(1920,2240),'#cbd5e1')
    draw=ImageDraw.Draw(sheet)
    for row,phase in enumerate(['before','after']):
        draw.text((24,row*1120+12),'ANTES' if phase=='before' else 'DESPUES',fill='#111827')
        img=Image.open(root/phase/f'{view}-{tab}-filled-light-1920.png').convert('RGB').crop((0,0,1920,1080))
        sheet.paste(img,(0,row*1120+40))
    sheet.save(root/f'comparacion-{view}.jpg')
