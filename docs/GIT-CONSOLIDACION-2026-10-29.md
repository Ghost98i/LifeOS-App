# Consolidación de Git — Celestian publicado

Preparación local del 29/10/2026. No se hizo staging, commit, tag, push, cambio de rama ni publicación. No se modificaron fuentes funcionales, el candidato sellado, Rules o datos. El estado de trabajo sigue pendiente de la autorización de consolidación.

## Base estable que se propone conservar

La versión publicada `a6834e05b0a17cff` corresponde al candidato `candidate-5de5252d2d00`, release `1793309965220000`. Se publicó desde un árbol de trabajo con modificaciones, **no desde un commit identificado**. No corresponde atribuirle retroactivamente el HEAD anterior ni inventar tres commits que aparenten representar despliegues independientes.

Se propone un solo commit honesto que consolide el estado existente y publicado, junto con sus pruebas, recursos, herramientas, documentación y política de exclusiones. Las nuevas funcionalidades posteriores podrán tener commits pequeños y separados. La procedencia pública y los hashes de los 79 archivos publicados se documentan en [el registro de versión](releases/celestian-2026-10-29.json); no se incluyen entornos privados ni paquetes de recuperación.

Rama actual: `review/lifeos-estado-2026-10-04`. Base: `92836120fb327161097232918d8297c6e7a5f8f6`. Coincide con el SHA anunciado por su rama de `origin`; `main` es ancestro y está 26 commits atrás. La consulta fue `git ls-remote`, sin fetch ni cambios de referencias. El repositorio tiene 84 commits localmente alcanzables. Remoto: `origin`, repositorio `Ghost98i/LifeOS-App` de GitHub.

## Política de archivos

| Grupo | Decisión |
|---|---|
| `src/`, incluidos tests y componentes existentes | Versionar todo el código y sus recursos; conservar también implementaciones históricas y pilotos existentes |
| `assets/`, `public/` | Versionar fuentes gráficas, derivados usados, fuentes tipográficas, iconos, animaciones y licencias |
| `scripts/` | Versionar herramientas propias, tests y generadores; sus salidas y evidencia siguen locales |
| `docs/`, README y guía histórica de despliegue | Versionar documentación técnica; usar el procedimiento consolidado para el candidato publicado |
| `package.json`, `package-lock.json`, TypeScript, Vite, ESLint, Firebase, configuración pública y `.env.example` | Versionar; `bun.lock` existente se conserva como archivo histórico, sin cambiar de gestor |
| `.github/` | Conservar su configuración existente, con la restricción de publicación indicada más abajo |
| Un bundle público observado en `release/published-observation-20261023/` | Excepción exacta como fixture de compatibilidad, verificada por SHA-256; no es un respaldo privado |
| `artifacts/`, otros `release/`, ZIP, backups, exportaciones y evidencia | Permanecen exclusivamente locales y preservados |
| `.env*` salvo plantillas, claves y credenciales | Permanecen locales; no forzar su inclusión |
| `node_modules/`, `dist/`, cachés y resultados de pruebas | Generados; no versionar |
| `.agent/`, `.agents/`, `skills-lock.json` | Paquetes instalados del entorno personal, no dependencias de la aplicación; permanecen locales |

`firebase-applet-config.json` contiene la configuración del cliente web que ya se distribuye públicamente. No contiene una cuenta de servicio ni su clave privada. El `.env` local se conserva fuera de Git aunque actualmente contenga configuración pública: esa exclusión también protege variables privadas futuras. El escaneo registra tipos de hallazgo, rutas y números de línea; nunca valores de credenciales.

Hay tres archivos generados **ya rastreados**: `LifeOS.html`, `MANIFEST.sha256` y `das` (salida de terminal con formato ANSI). `.gitignore` no puede retirarlos del índice por sí mismo. Se propone retirarlos **solo del índice** durante la consolidación autorizada, conservando sus archivos locales y su historial. `npm run build:portable` seguirá generando `LifeOS.html`. No se ejecutó esa retirada ni se reescribirá el historial.

La excepción `release/published-observation-20261023/assets_index-ExwrnwAV.js` mide 471.350 bytes y tiene SHA-256 `9587d33cf2ca848461ee384e882598700f65233554808a7f647e4ad2bc1cbb10`, exigido por `publishedResaleContract.test.ts`. Todos los demás archivos de `release/` siguen excluidos. Esto evita que esas tres regresiones se omitan en una copia futura de Git. El fixture no se movió ni modificó. El `.gitignore` histórico `assets/.aistudio/.gitignore` sigue rastreado; su propia regla ignora archivos nuevos de esa carpeta y no afecta a los recursos usados por la aplicación.

## Listas exactas y controles ejecutables

Las listas privadas se generan con:

```powershell
python scripts/prepare-git-consolidation.py inventory
python scripts/prepare-git-consolidation.py history-scan
python scripts/prepare-git-consolidation.py check
```

No ejecutan staging ni cambios de historial. Sus resultados quedan en `artifacts/git-organizacion-20261029/`, excluido de Git:

- `versionar.txt` y `versionar.paths0`: árbol exacto de archivos aprobados para la futura versión, sin directorios ni comodines.
- `nuevos-versionables.txt`: archivos que todavía no están rastreados y deben incorporarse.
- `versionar-hashes.json`: hashes para comprobar que la lista no cambió antes del staging.
- `retirar-solo-indice.paths0`: los tres generados cuyo archivo local debe conservarse.
- `excluir.json`: rutas locales/generadas/privadas identificadas; ninguna se considera descartable.
- `initial.json`, inventario, escaneos y logs: estado original, conteos, protección y controles. Son informes locales y no deben añadirse a Git.

Las herramientas históricas de capturas y auditorías pueden requerir Chrome instalado, rutas locales, fixtures de `artifacts/` o paquetes de `release/`. Se conservan como fuentes; no se presentan como comandos autónomos de CI. El circuito habitual `npm ci`, `npm run dev`, `npm test`, `npm run lint` y `npm run build` tiene código, recursos y configuración en la lista versionable. Usar Node compatible con `node:module.registerHooks`; el entorno verificado es Node 26.7.0. No ejecutar `npm run release` durante esta preparación: reconstruye y reemplaza un paquete local anterior.

## Primer commit: requiere autorización posterior

Autorizar explícitamente **staging selectivo, tres retiradas solo del índice y un commit local** en la rama actual, con mensaje propuesto:

`chore: consolidate published Celestian baseline and repository policy`

Antes: repetir el control de hashes y revisar las listas. Después, los comandos previstos son:

```powershell
$gitPlan = 'artifacts/git-organizacion-20261029'
python scripts/prepare-git-consolidation.py check
if ($LASTEXITCODE -ne 0) { throw 'Detener: revisar cambios respecto del plan.' }
git --literal-pathspecs add --pathspec-from-file="$gitPlan/versionar.paths0" --pathspec-file-nul
if ($LASTEXITCODE -ne 0) { throw 'Revisar el staging selectivo.' }
git --literal-pathspecs rm --cached --pathspec-from-file="$gitPlan/retirar-solo-indice.paths0" --pathspec-file-nul
if ($LASTEXITCODE -ne 0) { throw 'Revisar la retirada solo del índice; no forzar.' }
git diff --cached --stat
git diff --cached --check
git diff --cached --name-status
```

Antes del commit, comprobar que el índice contiene exactamente el árbol aprobado, que no hay secretos ni artefactos privados y que los tres archivos retirados siguen en disco. Revisar los diffs del código y repetir las validaciones afectadas si cambió algo desde el candidato. No usar `git add -A`, reset, clean, stash ni eliminar archivos para conseguir un estado visualmente limpio.

Solo después de esa revisión y de la autorización, crear el commit local. Opcionalmente, con autorización expresa para la etiqueta, añadir una etiqueta anotada propuesta `celestian-2026-10-29-tandas-1-2-3` al nuevo commit, explicando que conserva las fuentes consolidadas de la versión publicada, no que el despliegue original haya salido de ese commit. No crear etiquetas sobre `9283612` para representar cambios que aún están fuera de Git.

## Push y publicación: autorización separada

El workflow existente `.github/workflows/firebase-hosting-merge.yml` **compila y publica Hosting automáticamente cuando recibe un push a `main`**. Una fusión/publicación en `main` podría desplegar un build nuevo, distinto del candidato sellado, aunque se la describa como una tarea de Git. Este riesgo no se resuelve con `.gitignore`.

El push futuro propuesto, si se autoriza, se limita al commit de la rama `review/lifeos-estado-2026-10-04` hacia la misma rama de `origin`, y a la etiqueta solo si se autoriza también. Comprobar primero otra vez la punta remota y no forzar si avanzó. No enviar `main`, no fusionar ni cambiar ese workflow sin una decisión específica de publicación. La autorización del commit local no autoriza push, tag ni deploy.

## Protección y límites

No se movieron, eliminaron, sobrescribieron ni reescribieron respaldos sellados. La recuperación de auditorías, las evidencias de las tres tandas, el paquete consolidado, su ZIP, bundle y manifiestos se conservaron en sus ubicaciones. Los informes locales detallan qué respaldo pudo verificarse contra hashes y cuál se comprobó por presencia e integridad respecto del inventario inicial.

El escaneo de firmas del conjunto propuesto y de la historia local no encontró claves privadas o tokens reconocidos. No equivale a una garantía absoluta: no se abrieron los archivos privados comprimidos ni se consultaron secretos de GitHub o credenciales externas. Esos archivos no forman parte del conjunto versionable. No se detectó una razón demostrada para rotar credenciales ni reescribir el historial.
