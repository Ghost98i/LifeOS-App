import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const releaseDir = resolve('release/lifeos-anywhere-checked');
await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

await cp(resolve('dist'), resolve(releaseDir, 'dist'), { recursive: true });
for (const file of ['firebase.json', 'firestore.rules', '.firebaserc', 'DEPLOY.md']) {
  await cp(resolve(file), resolve(releaseDir, file));
}

console.log(`Paquete de despliegue preparado en ${releaseDir}`);
