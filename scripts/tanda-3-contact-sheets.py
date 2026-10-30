from pathlib import Path
from PIL import Image, ImageDraw
root=Path('artifacts/refinamiento-tanda-3')
for phase in ['before','after']:
    for view in ['estudios','notas','herramientas','proyectos','ia']:
        for theme in ['light','dark']:
            sheet=Image.new('RGB',(1920,1840),'#CBD5E1');draw=ImageDraw.Draw(sheet)
            for col,(width,height) in enumerate([(1920,1080),(2560,1440),(768,1024),(390,844)]):
                for row,state in enumerate(['empty','filled']):
                    img=Image.open(root/phase/f'{view}-{state}-{theme}-{width}.png').convert('RGB').crop((0,0,width,height));img.thumbnail((460,844))
                    x,y=col*480,row*920;draw.text((x+8,y+10),f'{view} | {width} | {theme} | {state}',fill='#111827');sheet.paste(img,(x+8,y+35))
            sheet.save(root/phase/f'contact-{view}-{theme}.jpg')
for view in ['estudios','herramientas','ia']:
    sheet=Image.new('RGB',(1920,2240),'#CBD5E1');draw=ImageDraw.Draw(sheet)
    for row,phase in enumerate(['before','after']):
        draw.text((24,row*1120+12),'ANTES' if phase=='before' else 'DESPUES',fill='#111827')
        img=Image.open(root/phase/f'{view}-filled-light-1920.png').convert('RGB').crop((0,0,1920,1080));sheet.paste(img,(0,row*1120+40))
    sheet.save(root/f'comparacion-{view}.jpg')
