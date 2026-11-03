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

## Puerta de distribución pendiente

**No está autorizado el despliegue por el mero resultado de las pruebas.** El propietario exige que no haya bloqueos de derechos/permisos para distribuir los recursos. La evidencia disponible no cierra esa puerta:

- `public/gym-icons/v1/README.md` mantiene: «Licensing is pending verification for every resource before public deployment».
- `docs/gym-icon-licenses.md` no acredita una licencia específica para los 22 SVG del catálogo. Identificar al creador de un archivo no demuestra qué modalidad de licencia se obtuvo.
- El mismo informe conserva pendientes de procedencia para `lifeos-micro-check-violet.json` y `gym-workout-success.lottie`.
- La aprobación visual, la presencia en Git y la publicación previa de un archivo no aportan por sí mismas los comprobantes que faltan. No se afirma una infracción; se registra que no puede acreditarse la condición de publicación exigida.

Se contrastaron las guías oficiales actuales, sin buscar ni descargar sustitutos: [Noun Project, modalidades de licencia](https://help.thenounproject.com/hc/en-us/articles/200509798-What-licenses-do-you-offer-for-icons), [Icons8, licencia](https://icons8.com/license), [Lottie Simple License](https://lottiefiles.com/page/license). No se asigna una licencia genérica a recursos sin procedencia ni se inventan autorizaciones de terceros.

Para cerrar el bloqueo hace falta evidencia que vincule esos archivos concretos con sus fuentes y permisos aplicables: fichas/licencias verificables, comprobantes de adquisición o autorización del titular que identifique los recursos. No se accede a cuentas privadas para buscarla, no se contacta a terceros y no se modifica/elimina/sustituye ningún recurso, crédito o animación.

Mientras falte esa evidencia, sólo se prepara y valida localmente. **No se publica una nueva Preview pública ni Live.** Se puede validar el respaldo público ya existente mediante lectura, sin crear nuevas distribuciones. Los hashes, pruebas y dictamen final se conservan en `artifacts/lifeos-gym-release-20261103/` del repositorio original. La candidata queda técnicamente preparada, pero con NO-GO de distribución pendiente del propietario.
