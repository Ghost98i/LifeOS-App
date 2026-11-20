# Release local: LifeOS estable + Gimnasio V2

Base Live comprobada el 3 de noviembre de 2026: Hosting `ddbbe87779025174`, release `1793639204821000`, entrada `/assets/index-17i1d_vC.js` con SHA-256 `e2bfcb63c5b7c1e8528124b233925de6f54a9cd0b48ec70e5fbd4d1f9b5b9bec`. Se contrasta con la reconstrucción estable de `e97e8c5da8bf4d5cd8b0966f565cdc59e45021f3` y con los archivos públicos actuales. No se consultan datos de usuarios.

## Construcción selectiva

La rama nueva `codex/lifeos-gym-stable-release-2026-11` parte de e97. Se aplican con `cherry-pick -x`, sin fusionar la candidata consolidada:

- `87470dc1eff3d11c96830004c2d04ef5cc0b003d`: Gimnasio V2 completo y cierre funcional.
- `a1aa6e453e4d6718bcb51cd4821f802feb4fc266`: conservación de campos existentes del descanso pausado durante carga/backup.
- `995d7e645b366fc989852d56ed88207a881b6205`: anchura global, distribución interna y regresión de layout.

No se incorpora la genealogía de `002c3cd3c143` ni `03076a81e1b3`. Los informes heredados describen sus contextos anteriores; no habilitan ni incluyen Finanzas nueva en esta rama. El código financiero, sus pruebas, normalizadores, persistencia compartida, merges, E2EE, modelos, Quick Capture y `App.tsx` deben coincidir con e97. La comparación de todos los archivos financieros y compartidos se registra en la evidencia externa al commit.

La única modificación compartida adicional es el mismo plugin de identidad de build ya probado en la candidata: inyecta un meta en HTML con `LIFEOS_BUILD_ID`. Permite identificar el artefacto y cambiar la revisión del precache sin modificar el código de operaciones o datos. No cambia dependencias, configuración Firebase, Rules ni servicios.

Los recursos aprobados se conservan por comparación binaria con el worktree V2. Las diferencias de checkout de finales de línea se corrigen sólo en este worktree nuevo para mantener esos bytes. Las ramas originales permanecen intactas.

## Puerta de distribución — NO-GO levantado (19 de noviembre de 2026)

El bloqueo **NO-GO** registrado originalmente el 3 de noviembre de 2026 respecto del catálogo SVG de Gimnasio y las dos animaciones Lottie sin licencia fue **resuelto y levantado** el **19 de noviembre de 2026** mediante sustitución completa por recursos 100 % propios de **Celestian LifeOS**:

- **Catálogo SVG de equipamiento (`public/gym-icons/v1/`):** se reemplazaron la totalidad de los archivos previos (los 22 originales auditados + los 12 incorporados posteriormente) y se amplió la cobertura a **39 íconos SVG industriales/mecánicos 100 % originales** (`viewBox="0 0 64 64"`, cero siluetas humanas, sin metadatos ni atribuciones de terceros). Todos los registros en `src/lib/gymIconRegistry.ts` figuran con `licenseStatus: 'first-party-original'`.
- **Animaciones Lottie sin licencia (`public/motion/`):** se reemplazaron `lifeos-micro-check-violet.json`, `lifeos-micro-check-fast-violet.json` y `gym-workout-success.lottie` (archivo binario eliminado y sustituido por `gym-workout-success.json`) por animaciones Lottie JSON 100 % originales en formato LF normalizado, con hashes SHA-256 verificados en `src/lib/motion.test.ts`:
  - `lifeos-micro-check-violet.json`: `be037d6e734e650ba762884cde3072d514f7241f85b5b1809694b5ae7d4ed85f`
  - `lifeos-micro-check-fast-violet.json`: `d008c1ed4e7f00865d3ac41cfb375871d9bc952f2abe4be23a4351eb12196940`
  - `gym-workout-success.json`: `b56d6fe37fa8d25c30d84ba25bd1697053f49e45271c820f35b23f52f3df6dd3`
- **Documentación actualizada:** `public/gym-icons/v1/README.md`, `public/motion/README.md`, `public/creditos.html`, `docs/gym-icon-licenses.md` y `docs/PLAY-STORE.md`.

**Dictamen actualizado:** **GO** para el paquete de recursos de Gimnasio y las animaciones reemplazadas (NO-GO legal de Gimnasio levantado). Para la publicación final en Play Store siguen vigentes los requisitos operativos generales de `docs/PLAY-STORE.md` (correo de contacto real, firma/TWA y verificación del plan de Icons8 para los íconos generales de `AppIcon.tsx`).
