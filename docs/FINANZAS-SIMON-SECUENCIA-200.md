# Regresión de Simón: tres gastos de $U 200 sin descripción

Fecha: 30 de octubre de 2026. Datos exclusivamente sintéticos. Rama principal de trabajo existente: `review/lifeos-estado-2026-10-04`.

**Actualización posterior autorizada:** el parche de Rules descrito aquí como propuesta ya fue aplicado únicamente al repositorio local. La validación actual alcanza 55 pruebas de emulador y 19 puntos E2E; ver [aplicación local, compatibilidad y estrategia de despliegue](FINANZAS-RULES-PARCHE-LOCAL-DESPLIEGUE.md). Este documento conserva los resultados anteriores al endurecimiento; producción no fue modificada.

## Conclusión demostrada

Tres operaciones independientes de $U 200, categoría Comida, misma fecha y descripción vacía producen saldos **$U 800, $U 600 y $U 400** desde $U 1.000. Revisar la advertencia no devuelve dinero. La descripción vacía no impide registrar ni contabilizar ninguna de ellas.

Se demostró un mecanismo adicional de pérdida silenciosa en el código anterior: **una fusión interpretaba la ausencia de un movimiento como su eliminación, aunque no hubiera tombstone (evidencia explícita de borrado)**. Si el movimiento superviviente coincidía con la base, la fusión lo descartaba sin conflicto. Con dos gastos ya revisados, una instantánea de después de la primera compra hacía pasar el saldo de **$U 600 a $U 800**.

Esto coincide con la magnitud y parte de la forma del síntoma reportado. No demuestra que sea la causa del incidente de Simón: no se inspeccionaron sus datos, su versión instalada, sus clientes ni sus revisiones remotas. El origen de una eventual instantánea obsoleta en su sesión sigue sin establecerse. La prueba de fusión no depende de cambiar ni culpar a las Rules.

## Separación de eventos

Se registran por separado creación, revisión, publicación, recepción y recarga. La comparación utiliza IDs, contenido completo de transacciones, `revisionOrder`, revisión del módulo local/remoto, saldo persistido y saldo reconstruido por el ledger.

El primer gasto no tiene otro movimiento con el que coincidir y no muestra una advertencia ficticia. Desde el segundo aparece «Posible duplicado». En el E2E se pulsa «Conservar operación» sobre el movimiento recién registrado; no se eliminan operaciones ni se modifican sus descripciones para evitar el aviso.

| Paso normal | Movimientos | Gasto acumulado | Saldo local, derivado y remoto |
| --- | ---: | ---: | ---: |
| Inicial | 0 | 0 | 1.000 |
| Primer registro, sincronización y recargas | 1 | 200 | 800 |
| Segundo registro y recarga previa a revisar | 2 | 400 | 600 |
| Conservar segundo, sincronizar y recargar | 2 | 400 | 600 |
| Tercer registro y recarga previa a revisar | 3 | 600 | 400 |
| Conservar tercero, sincronizar y recargar | 3 | 600 | 400 |

Revisar cambia metadatos de revisión y la versión del evento/módulo. No cambia el importe, fecha, categoría, cuenta ni identidad de ninguna compra. Los tres IDs permanecen distintos aunque los demás campos coincidan.

## Antes y después de la fusión defectuosa

`scripts/audit-finance-baseline.mjs` compila el código financiero de `HEAD` en un bundle aislado y lo compara con el árbol de trabajo, sin checkout ni cambios de datos reales.

| Mecanismo | Código anterior | Código corregido |
| --- | --- | --- |
| Revisar después de dos gastos | 2 movimientos, saldo 600 | 2 movimientos, saldo 600 |
| Fusionar con instantánea de una sola compra, base de dos compras ya reconocidas, sin borrado explícito | **1 movimiento, saldo 800, ningún conflicto** | **2 movimientos, saldo 600, conflicto explícito** |
| Recibir directamente una instantánea anterior sobre un cliente sin cambios pendientes | Podía reemplazar el estado sin comparar la continuidad del libro | Se verifica continuidad antes de aplicarla; se conserva el libro local y se detiene la sincronización |

Por tanto, en la reproducción el salto de saldo ocurre **en la fusión o recepción de una instantánea**, no dentro de `markTransactionReviewed`. Una coincidencia temporal con la revisión no permite atribuirle el cambio.

## Corrección del cliente

- La ausencia de un evento financiero presente en la base ya no constituye por sí sola un borrado. Sin evidencia de eliminación se informa un conflicto y se conserva el estado local.
- `mergeSyncModuleWithConflicts` devuelve el estado original ante cualquier conflicto financiero; no entrega una versión parcial como si estuviera lista para aplicar.
- `detectFinanceSnapshotRegression` comprueba identidades repetidas, movimientos ausentes sin evidencia de borrado, revisiones anteriores/incompatibles, reintroducción de versiones eliminadas según los tombstones existentes y saldos recibidos que no coinciden con sus movimientos.
- La comprobación se integra en la recepción automática inicial, las actualizaciones remotas de un cliente sin cambios pendientes y los mensajes entre pestañas.
- Los tombstones del sobre remoto se leen también antes de la hidratación inicial. Una eliminación legítima con evidencia vigente sigue admitiéndose; no se transforma todo borrado en una operación nueva.
- Un conflicto financiero bloquea nuevas mutaciones financieras y publicaciones automáticas hasta revisar las versiones. Las copias local, remota y base utilizan el mecanismo de recuperación existente. No se ejecuta ninguna reparación automática.
- Una recepción financiera cuyo guardado local falla conserva el estado anterior en memoria y no anuncia que la nueva versión haya quedado guardada.

No se modificó el diseño de «¿En qué gastaste?», ni se exigieron nombres diferentes, ni se deduplicó por importe/categoría. Tampoco se cambiaron E2EE, tipos persistidos, Firestore Rules ni datos reales. Los cambios pendientes de Gimnasio y Agenda permanecen conservados.

## E2E con dos clientes reales de navegador

`scripts/test-finance-simon-e2e.mjs` abre dos perfiles aislados de Playwright conectados a Auth y Firestore Emulator. Ambos usan la misma cuenta sintética y el mismo cifrado de prueba. Las compras se alternan entre perfiles. Cada perfil se recarga entre registro y revisión, y después de esta.

La comprobación del documento remoto se realiza desde Node por REST contra el emulador y se descifra con la clave sintética en memoria. Así no se confunden escrituras pendientes de la caché del SDK de un navegador con una publicación ya confirmada por el servidor. La traza espera la convergencia de contenido y revisión de ambos clientes antes de avanzar.

**Resultado: 16 puntos de comprobación aprobados.** El flujo normal conserva 800 → 600 → 400. Se verifican también estas dos simulaciones independientes:

1. **Escritor obsoleto que usa el guard actual:** la revisión padre vieja se rechaza; servidor y ambos clientes conservan tres movimientos y $U 400.
2. **Escritor directo que evita ese guard:** se envía una instantánea cifrada anterior de dos compras mediante REST autenticado como el usuario sintético, sin privilegios administrativos de escritura. Las Rules actuales la aceptan y el servidor queda en dos compras/$U 600. **Ambos clientes corregidos conservan sus tres compras/$U 400, abren un conflicto y no adoptan la instantánea anterior. Al recargar, el bloqueo y los $U 400 permanecen.**

El segundo caso prueba una limitación real todavía abierta del servidor. El parche de cliente protege copias locales conocidas; no puede impedir por sí mismo que un escritor antiguo sobrescriba Firestore ni reconstruir operaciones que un dispositivo nuevo nunca haya visto.

## Propuesta de Rules, preparada pero no aplicada

`docs/finance-parent-revision-proposal.patch` contiene únicamente dos cambios de condición: exigir la revisión padre para todo el módulo Finanzas, incluso sin protección comercial. Creación: `parentRevision == null`. Actualización: `parentRevision == resource.data.revision`. No cambia el formato cifrado ni inspecciona el interior del ciphertext.

La propuesta se cargó **solo en el proyecto aislado `demo-finance-revision` del emulador**. `firestore.rules` del repositorio permanece intacto, igual que producción. La prueba `financeRevisionProposal.emulator.test.ts` verificó:

- Tres gastos cifrados sin descripción: 800, 600 y 400 persistidos.
- Rechazo de instantánea obsoleta con revisión padre vieja y de escritor que omite la revisión padre; quedan tres movimientos y 400.
- Continuidad de datos plaintext históricos cuando el cliente envía la revisión padre vigente.
- Los módulos ajenos, como Notas, conservan su autorización previa.

La incompatibilidad es deliberada: un cliente antiguo que escribe Finanzas sin revisión padre dejaría de poder hacerlo. No se aplica automáticamente porque la instrucción original exige demostrar la necesidad y detenerse para informar antes de cambiar Rules. Aplicar el parche local tampoco equivale a desplegarlo; no se hizo ningún deploy.

## Validación y archivos de evidencia

- **1.292 pruebas unitarias aprobadas**, incluidas cinco regresiones específicas nuevas de esta ampliación.
- **4 pruebas de emulador aprobadas**, sin omisiones; una caracteriza el riesgo de las Rules actuales y otra prueba la propuesta aislada.
- **E2E de dos perfiles: aprobado, 16 puntos de comprobación.**
- Lint, TypeScript, build y `git diff --check`: aprobados. Permanece el aviso existente de tamaño de chunks.
- `git apply --check docs/finance-parent-revision-proposal.patch`: aprobado; no aplica el parche.

Evidencias sintéticas:

- `artifacts/finance-integrity/before-after.json`: 600 → 800 sin conflicto antes; 600 → 600 con conflicto después.
- `artifacts/finance-integrity/simon-trace.json`: contenido completo de transacciones, revisiones y balances por cliente en cada paso.
- `artifacts/finance-simon-e2e.log` y `artifacts/finance-simon-emulators.log`.
- `artifacts/finance-simon-unit.log`, `artifacts/finance-simon-lint.log`, `artifacts/finance-simon-build.log`.

Ejecutar desde el repositorio:

```powershell
npm test
npm run lint
npm run build
node scripts/audit-finance-baseline.mjs

$financeSocketDisabled = Join-Path (Get-Location) 'artifacts\no-unix-sockets'
if (Test-Path -LiteralPath $financeSocketDisabled) { throw 'La ruta de fallback TCP debe ser inexistente' }
$env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=$financeSocketDisabled"
$env:VITE_FIREBASE_PROJECT_ID = 'demo-lifeos'
firebase emulators:exec --project demo-lifeos --only firestore,auth "node --import tsx --test --test-concurrency=1 src/lib/financeRepeatedIntegrity.emulator.test.ts src/lib/financeRevisionProposal.emulator.test.ts src/lib/cloudWriteRevision.emulator.test.ts"
firebase emulators:exec --project demo-lifeos --only firestore,auth "node scripts/test-finance-simon-e2e.mjs"
```

La causa del incidente concreto de Simón sigue sin confirmarse. Queda demostrado un mecanismo compatible con el síntoma y corregido en el cliente, además de una brecha de revisión remota cuya corrección del servidor está preparada y requiere decidir su compatibilidad antes de aplicarse. No se declara cerrada la integridad del servidor con las Rules actuales.
