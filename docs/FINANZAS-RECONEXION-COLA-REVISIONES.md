# Finanzas: bloqueo de publicación después de reconectar dos clientes

Dictamen local: **GO para continuar preparando la publicación**. No se publicó nada. Investigación y pruebas exclusivamente con datos sintéticos y emuladores de `demo-lifeos`.

## Causa demostrada

Se preservó el diagnóstico aportado y se reprodujo el fallo antes de corregir la lógica. La reproducción instrumentada también agotó el límite anterior de 45 segundos: A conservaba cinco gastos/saldo 0 en conflicto, mientras B y Firestore tenían cuatro/saldo 200.

La secuencia real está en `artifacts/sync-reconnect/root-cause-timeline.json` y su traza completa en `before-sync-events.json`:

1. A prepara una publicación de cuatro gastos mientras está offline. Esa preparación recibe un ID de revisión, pero **no está confirmada en Firestore**.
2. B confirma sus cuatro gastos. A recibe ese head y fusiona correctamente los dos gastos independientes: cinco IDs y saldo 0.
3. El listener adopta correctamente la revisión del head de B. Sin embargo, guarda la **unión local de cinco movimientos como baselineData**, mientras el fingerprint corresponde al head remoto de cuatro. Baseline y revisión dejan de describir el mismo contenido confirmado.
4. Antes de terminar la publicación offline, otra publicación intenta enviar los cinco movimientos. `optimisticRevisionMap` utiliza como padre la preparación offline sin confirmar, en lugar del head vigente de B. En la traza, `publish-start` con cinco IDs tiene `expectedRevision` diferente de `revision`; el padre elegido coincide con la preparación todavía pendiente.
5. `cloudSync.ts` lee la revisión vigente dentro de la transacción y aborta con `CloudRevisionConflict`. El callback de error elimina la revisión pendiente y vuelve a añadir Finanzas a la cola, pero **no programa un nuevo flush ni una lectura/reconciliación**. Al no llegar otro head, A queda en «Conflicto pendiente» con su gasto local intacto y sin publicar.

La igualdad entre `localRevision` y la revisión de Firestore solo indicaba que A había leído el head de cuatro gastos. No demostraba que su contenido local de cinco hubiera sido publicado.

En esta reproducción **no hubo un `conflict-finance-missing` real**: el bloqueo fue la cola sin reanudación tras el rechazo transaccional. Sí se demostró un segundo defecto relacionado: si se usa la unión de cinco como baseline y vuelve a recibirse el head remoto de cuatro, `mergeFinanceEventCollection` considera al gasto local nuevo una ausencia de algo supuestamente confirmado. Una regresión reproduce ese falso conflicto con el baseline anterior y demuestra su ausencia con el baseline correcto. La protección contra ausencias sin tombstone permanece intacta.

El rechazo transaccional observado ocurre al comparar las revisiones con el estado leído del servidor; no se atribuye ese callback a un rechazo de Rules. Por separado, el E2E confirma que una escritura directa autenticada con padre obsoleto sigue recibiendo 403 de las Rules.

## Cambios

- `src/App.tsx`: las publicaciones que incluyen Finanzas se serializan. Una escritura en curso deja las nuevas intenciones en cola y, al concluir o reconciliarse, programa la publicación del estado local más reciente. Finanzas utiliza exclusivamente un padre confirmado; no encadena una preparación offline como si estuviera publicada.
- El baseline financiero de la hidratación/fusión representa el contenido remoto confirmado, nunca la unión pendiente de publicar. Un callback de finalización antiguo no sobrescribe ese baseline.
- Ante `CloudRevisionConflict`, el cliente realiza una lectura fresca, conserva los tombstones, fusiona con el baseline confirmado y republica solamente si no hay conflictos incompatibles. La adopción de un head leído no descarta la intención de subir cambios locales. Si el listener procesó una revisión más reciente durante la lectura, no se retrocede a la anterior.
- Hay un máximo de **tres recuperaciones automáticas consecutivas** tras rechazos de revisión; si la publicación sigue compitiendo, se conserva el bloqueo con las versiones local/remota/base para revisión. Una publicación confirmada reinicia ese límite. Los errores de lectura mantienen datos y cola, mostrando error/offline; no se finge éxito ni se reintenta indefinidamente.
- `src/lib/financeSyncReconciliation.ts`: centraliza la reconciliación financiera y devuelve separadamente el estado fusionado, los conflictos, el baseline confirmado y la necesidad de publicar.
- `src/lib/cloudSync.ts`: la lectura fresca devuelve además los tombstones existentes del contenido descifrado, para que una recuperación pueda respetar un borrado explícito incluso antes de recibirlo por el listener. No cambia el formato persistido ni el cifrado.
- `scripts/test-finance-simon-e2e.mjs`: vuelve al límite de **20 segundos**, exige «Sincronizado» en ambos clientes, comprueba la coherencia baseline/fingerprint, los cinco IDs, contenido completo, saldo derivado y revisión remota. Recarga ambos navegadores. Incorpora un modo de head repetido controlado y trazas optativas solo para desarrollo `demo-lifeos`.

No se modificaron las protecciones de `syncMerge.ts`/`syncModel.ts`, el ledger, las Rules ni el contrato persistido. Las revisiones realmente incompatibles siguen bloqueadas; las versiones se conservan. No se deduplica por similitud.

## Validación real

| Estado | Cliente A | Firestore | Cliente B |
|---|---|---|---|
| Fallo antes del parche | 5 IDs, $U 0, conflicto | 4 IDs, $U 200 | 4 IDs, $U 200, sincronizado |
| Después del parche | 5 IDs, $U 0, sincronizado | Los mismos 5 IDs, $U 0 | Los mismos 5 IDs, $U 0, sincronizado |
| Recarga de ambos | Los mismos 5 IDs, $U 0, sincronizado | Los mismos 5 IDs, $U 0 | Los mismos 5 IDs, $U 0, sincronizado |

- **1.306 pruebas unitarias aprobadas**, ninguna omitida. Cinco nuevas cubren unión de gastos idénticos, baseline remoto, head repetido, edición pendiente, ediciones incompatibles, eliminación con tombstone y rechazo de una ausencia sin evidencia de borrado.
- **57 pruebas Firestore/Auth Emulator aprobadas**, ninguna omitida, incluyendo la nueva prueba transaccional cifrada de rechazo/fusión/republicación, head repetido, edición incompatible y tombstone recuperado desde lectura fresca. También pasan las regresiones financieras/comerciales y de la versión archivada `a6834e05b0a17cff`.
- El comando completo `firebase emulators:exec --project demo-lifeos --only firestore,auth "node scripts/run-finance-rules-regressions.mjs --browser"` terminó correctamente: 57 pruebas y los **19 checkpoints** del E2E estricto.
- Un E2E adicional fuerza la llegada de un segundo head remoto de cuatro movimientos mientras A todavía conserva su unión local de cinco y se retienen sus lecturas de publicación. Después se libera el transporte: no aparece un falso conflicto de ausencia y se confirma la unión.
- Tres repeticiones adicionales, con parada ante el primer fallo: **normal / head repetido / normal**, todas con 19 checkpoints y recarga de ambos clientes. Esperas del checkpoint de reconexión: **2.245 / 1.509 / 1.825 ms**, por debajo de 20 segundos. En el modo controlado el tiempo de la barrera previa se registra en la traza de eventos; esa medición no es un benchmark del transporte.
- ESLint, TypeScript, build y `git diff --check`: aprobados. El build mantiene el aviso existente de tamaño de chunks.

La prueba compara IDs, transacciones persistidas completas, saldos reconstruidos y estado del servidor. No utiliza capturas como evidencia de integridad.

## Evidencia conservada

En `artifacts/sync-reconnect/`:

- `reported-failure.json`: diagnóstico original aportado.
- `App.before.tsx`, `before-browser.log`, `before-check.json`, `before-sync-events.json`: código previo y reproducción fallida antes de la corrección funcional.
- `root-cause-timeline.json`: secuencia reducida, con IDs y revisiones exactas que permiten verificar el padre incorrecto, el baseline de cinco y la cola detenida.
- `after-race.log`, `after-race-events.json`, `after-race-check.json`, `after-race-trace.json`: prueba controlada del head repetido.
- `full-emulator-browser.log`: suite completa y E2E final.
- `repeat-results.json`, `repeats.log`, `repeat-1-*`, `repeat-2-*`, `repeat-3-*`: resultados, diagnósticos y trazas de cada repetición. No se sustituyeron fallos por un último intento verde.
- `unit-tests.log`, `lint.log`, `build.log`: verificaciones generales.

## Riesgos y límites

La validación sintética no cubre todas las intercalaciones posibles de una red real. Cambios incompatibles, lecturas que no puedan verificarse o competencia continua deben seguir requiriendo intervención; se mantienen estados explícitos y copias para recuperación. Un cliente viejo conserva el defecto hasta actualizarse. Los conflictos o baselines inconsistentes ya existentes no se reparan automáticamente ni se descartan: deben conservarse y revisarse si la reconciliación segura no puede demostrarse.

**GO para continuar la preparación**, con actualización de clientes y la estrategia de publicación gradual de cliente/Rules ya documentada. No equivale a autorización de despliegue. No hay migraciones ni reparaciones de datos reales.

SHA-256 de `firestore.rules` antes/después de esta intervención: `E96D08BF9E619F8173A98D9469F5EB0DC1C8DC68429099E0DF75EC790A745526`. Se preservaron los cambios locales previos de Gimnasio, Agenda y Finanzas. Sin commits, push, merge, resets ni deploys.
