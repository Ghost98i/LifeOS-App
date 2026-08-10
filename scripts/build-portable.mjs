import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const builtFile = resolve('dist/index.html');
const portableFile = resolve('LifeOS.html');
const html = await readFile(builtFile, 'utf8');
const icon = await readFile(resolve('public/lifeos-icon-32.png'));

if (/\b(?:src|href)=["']\.\/assets\//.test(html)) {
  throw new Error('El build todavía contiene archivos externos y no es portable.');
}

const portableHtml = html
  .replace(/<link rel="icon"[^>]*>/g, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>/g, '')
  .replace('</head>', `<link rel="icon" type="image/png" href="data:image/png;base64,${icon.toString('base64')}"></head>`);

if (/href="\/lifeos-icon-/.test(portableHtml)) {
  throw new Error('El build portable todavía depende de iconos externos.');
}

await writeFile(portableFile, portableHtml, 'utf8');
console.log(`LifeOS portable creado en ${portableFile}`);
