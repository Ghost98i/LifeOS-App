import { copyFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const builtFile = resolve('dist/index.html');
const portableFile = resolve('LifeOS.html');
const html = await readFile(builtFile, 'utf8');

if (/\b(?:src|href)=["']\.\/assets\//.test(html)) {
  throw new Error('El build todavía contiene archivos externos y no es portable.');
}

await copyFile(builtFile, portableFile);
console.log(`LifeOS portable creado en ${portableFile}`);
