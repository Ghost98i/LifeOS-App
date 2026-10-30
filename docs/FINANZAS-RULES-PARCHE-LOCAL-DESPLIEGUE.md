# Finanzas: parche local de Rules y preparación de despliegue

30 de octubre de 2026. Rama existente `review/lifeos-estado-2026-10-04`.

**Dictamen: GO para preparar un despliegue gradual de cliente y Rules con alcance de protección frente a revisiones obsoletas. NO-GO para publicar ahora sin autorización y preflight, ni para anunciar protección absoluta contra clientes que falsean metadatos o contenido cifrado.**

## Cambio autorizado y aplicado

Se verificó que `docs/finance-parent-revision-proposal.patch` coincide exactamente con las dos sustituciones evaluadas en el emulador aislado. Se aplicó ese archivo, sin `--index`, a `firestore.rules`. Una comparación posterior de todo el contenido comprobó que no existen otras modificaciones de reglas: el diff es **2 líneas agregadas y 2 quitadas**.

| Operación en `/users/{uid}/lifeosModules/finance` | Condición local ahora obligatoria |
| --- | --- |
| Crear el documento | Existe `parentRevision` y vale `null` |
| Actualizar el documento | `parentRevision` es una cadena y coincide exactamente con `resource.data.revision`, leída por Firestore del documento vigente |
| Eliminar el documento | Continúa prohibido |

Se quitó exclusivamente la excepción `!userHasCommercialResale(userId)` en ambas condiciones. La protección se aplica también a cuentas sin actividad comercial. El parche preparado abarca Finanzas tanto cifradas como plaintext; no se limitó artificialmente al caso cifrado. Las validaciones anteriores de E2EE, protocolo, propiedad del usuario y protección comercial siguen intactas.

Esto no confía en un contador o timestamp arbitrario enviado por el cliente. Se compara un token padre con el estado actual del servidor. Dos publicaciones desde el mismo padre no pueden confirmar ambas: tras la primera, el padre de la segunda deja de coincidir.

Huellas SHA-256 de los bytes locales:

- Antes: `9EC48C90279F315A1C94C63249ECEDDE582D3DD358E06702C839646DC698CBFF`.
- Después: `E96D08BF9E619F8173A98D9469F5EB0DC1C8DC68429099E0DF75EC790A745526`.
- Parche aplicado: `6A8077A4310C6BA765128EB8005D13F6045443859021770217A5D2DCEEAA0237`.

No se modificó código productivo del cliente en esta intervención. Se conservaron las correcciones de Gimnasio, Agenda y Finanzas; se contrastaron las huellas de las fuentes principales con su estado al comenzar. Los cambios adicionales son pruebas, su runner y documentación. No hubo commit, push, tag, merge, deploy, acceso a datos personales, migración ni reparación de movimientos reales.

## Auditoría de rutas `allow`

Se revisaron todos los `match` y `allow` del archivo. No hay un `allow` recursivo ni superpuesto que autorice otra escritura del documento canónico financiero.

| Ruta | Resultado y alcance |
| --- | --- |
| `lifeosModules/finance` | Solo su `create`/`update` específico; siempre exige el padre adecuado. Otro usuario, un padre viejo, `null` en una actualización y un supuesto contador futuro se rechazan |
| Subcolecciones debajo de ese documento o colección alternativa `finance/state` | No tienen `allow` coincidente; se rechazan |
| `lifeosRevisions/{id}` | Es un archivo separado. Una creación válida de revisión puede admitirse sin actualizar el head. No se permite sustituir su ciphertext por update; se conserva la excepción anterior para `updatedAt`. Un lote con head rechazado no deja filtrada su revisión de archivo |
| `lifeos/state` legado | Sigue escribible para una cuenta aún plaintext/sin capability; se bloquea al activar capability cifrada. No modifica el head financiero. El cliente moderno consulta el legado como fallback cuando no hay módulos. No debe confundirse ese documento independiente con la publicación canónica |
| `lifeosAccount/*` | Maneja capability y envoltura de clave con sus restricciones existentes; no actualiza el head. Cambiar metadatos de cuenta no elimina la comparación padre de Finanzas |
| Otros módulos | Conservan su autorización previa. Las Rules no pueden inspeccionar las estructuras dentro de un ciphertext de otro módulo; el parche no demuestra seguridad semántica global de toda la aplicación |

Las pruebas comprobaron los rechazos y verificaron después que la revisión del head no hubiera cambiado. Se verificaron también los comportamientos separados del archivo y del documento legado; no se afirma que esas rutas sean inmutables o hayan recibido una nueva protección que el parche no agrega.

## Pruebas positivas y negativas

**55 pruebas de emulador aprobadas, 0 fallidas, 0 omitidas**, distribuidas en 10 archivos: Rules, E2EE y migración sintética, Finanzas, concurrencia, Gimnasio, publicaciones comerciales, atomicidad Reventa/Finanzas y compatibilidad del publicador archivado. Además, **1.292 pruebas unitarias** y lint con TypeScript aprobados.

| Caso | Resultado |
| --- | --- |
| Crear y actualizar Finanzas cifradas con padre vigente | Aceptado y descifrable |
| Tres gastos independientes de 200 sin descripción | 800 → 600 → 400 desde 1.000 |
| Instantánea vieja, padre viejo, omisión de padre o `null` en update | Rechazado; se conserva el libro reciente |
| Token inventado muy alto y timestamp futuro | Rechazado si no coinciden con el padre del servidor |
| Dos escritores concurrentes desde el mismo padre | Uno confirma; el otro se rechaza |
| Head y revisión archivada en lote rechazado | Ninguno se publica |
| Datos plaintext históricos con padre vigente | Aceptados mientras las restricciones de cifrado existentes lo permiten |
| Cliente antiguo de Finanzas sin padre | Rechazado intencionalmente; requiere actualizar y revisar sus pendientes |
| Operaciones comerciales con sus requisitos actuales | Regresiones aprobadas; se preserva la publicación conjunta y las protecciones previas |
| Downgrade cifrado, protocolo incompatible y acceso entre usuarios | Continúan rechazándose según los contratos anteriores |

Algunos rechazos negativos del emulador registran también el límite de evaluación de expresiones de las Rules, además de `PERMISSION_DENIED`. No se interpretaron como aceptación. Las pruebas positivas pertinentes sí confirmaron sus operaciones; el parche no reorganizó reglas ni límites de lotes fuera del alcance autorizado.

## Compatibilidad con `a6834e05b0a17cff`

Se verificaron los **79 archivos** del candidato público archivado contra `docs/releases/celestian-2026-10-29.json`, cuyo `publishedVersion` identifica exactamente `sites/lifeosanywhere/versions/a6834e05b0a17cff`. No se atribuyó el build a otro commit ni se usó el fixture anterior de octubre 23 como sustituto.

La prueba extrae por AST el publicador, clasificadores y manejador de rechazos del bundle archivado `assets/index-DalLIlZe.js`, SHA-256 `b026c8e6871d3d7ebb53d481e0623615020f1da8b3a723b8529cd2967b44248d`. Ejecuta ese código contra un SDK real y las Rules locales del emulador. Los adaptadores proporcionan servicios de prueba y cifrado; se materializa el objeto exterior al cruzar el límite de prototipos VM/SDK. No se modifican las instrucciones extraídas ni los metadatos publicados.

Resultado: el publicador de esa versión ya envía `parentRevision` y comprueba las revisiones dentro de una transacción. Crea y actualiza correctamente con las Rules endurecidas; una revisión antigua se rechaza. Su manejador de rechazo conserva el estado local y la cola, y marca `error` o `offline` según el caso. Una divergencia se trata como conflicto.

**Límite de esta compatibilidad:** no es un E2E completo de todas las pantallas del bundle publicado. No implica que ese build incluya las correcciones financieras posteriores de este repositorio, ni que su mezclador antiguo sea seguro en todos los escenarios. La compatibilidad de escritura no sustituye actualizar el cliente. Las validaciones comerciales actuales se cubren por sus suites específicas, no por los adaptadores de la prueba del publicador antiguo.

| Instalación | Tratamiento |
| --- | --- |
| Cliente actualizado local | E2E completo con dos navegadores, cifrado y desconexión física: aprobado |
| Publicador archivado `a6834e05b0a17cff` | Compatible con CAS y protocolo cifrado 2 en los casos probados; actualizar por las correcciones posteriores de integridad |
| Anterior que envía el padre correcto | No se bloquea solo por su edad; se admite si satisface también cifrado/protocolo/comercio |
| Anterior que omite el padre o reutiliza uno viejo | Escritura rechazada; no agregar una excepción para permitirle sobrescribir |
| Cliente con revisión remota desconocida ante un head existente | No asumir que `null` habilita reemplazarlo. Obtener y comparar las versiones; resolver diferencias conservando ambas |

## Offline, rechazos y estado de sincronización

El E2E de dos perfiles actualizados pasó **19 comprobaciones** contra Auth/Firestore Emulator. Usa un observador REST independiente de la caché del SDK y descifra el documento confirmado del servidor. Comprueba cantidades, IDs, contenido, revisiones y saldo reconstruido, además de la UI.

1. Tres gastos iguales: servidor y ambos clientes conservan tres IDs y saldo 400, incluso tras revisar y recargar.
2. Un escritor directo autenticado intenta restaurar la instantánea de dos compras: recibe HTTP 403. El servidor y los clientes siguen en 400 después de recargar.
3. Un navegador físicamente desconectado guarda otra compra: tiene cuatro movimientos y saldo 200 persistidos localmente, muestra «Sin conexión», y el servidor mantiene tres/400. No se presenta como sincronizado.
4. El otro navegador registra una operación independiente mientras el primero sigue offline: el servidor pasa a cuatro/200 con otro ID.
5. Al reconectar, ambos convergen a **cinco movimientos distintos y saldo 0**. Se conserva el ID pendiente offline y la recarga mantiene los cinco. El estado finalmente pasa a «Sincronizado».

Además, en la prueba del publicador archivado se encola realmente un lote antiguo con el SDK sin red. Otro cliente cambia el head antes de reconectarlo. El servidor rechaza ese lote con `permission-denied`; no publica su revisión de archivo. El estado local independiente conserva sus bytes originales; el callback publicado deja error y cola pendiente. La conciliación sintética de los dos movimientos independientes conserva cinco operaciones y puede publicarse con el padre nuevo.

Para el callback publicado en estado offline también se inyecta un fallo de transporte explícito. **No se presenta eso como desconexión física:** `disableNetwork` controla las escrituras en cola, pero no funcionó como cortafuegos de todas las RPC del SDK en este entorno. La desconexión física corresponde al E2E de Playwright descrito arriba.

No se probó el cambio de Rules mientras un dispositivo real del usuario conserva una cola antigua, ni se inspeccionó esa cola. Ese caso requiere el procedimiento de preservación y actualización siguiente, no un reseteo.

## Límites demostrados frente a metadatos manipulados

Se ejecutó una caracterización negativa en un usuario sintético separado:

- Con el head vigente en tres movimientos/saldo 400, un escritor autorizado lee su revisión actual.
- Envía un ciphertext viejo de cero movimientos/saldo 1.000, pero adjunta **ese padre vigente**.
- Incluso reutiliza como `revision` el valor actual.
- Las dos condiciones autorizadas permiten la operación. El ciphertext viejo sigue siendo criptográficamente válido y descifrable.

Por ello, CAS impide confirmar desde un padre que ya quedó atrás; **no certifica la veracidad de una instantánea si un escritor autorizado falsifica su relación con el padre actual**. Tampoco exige unicidad, avance o no reutilización de `revision`. La comparación del servidor es real, pero la semántica del contenido permanece opaca por E2EE. Los SDK de servidor con credenciales administrativas tampoco quedan sometidos a las Security Rules.

No se incorporó ninguna condición extra ni se cambió E2EE para disimular ese límite. Garantizar integridad frente a un cliente manipulado exigiría otro diseño y un contrato explícitamente revisado; agregar un contador controlado por ese mismo cliente no lo resolvería. El GO de preparación corresponde a protección frente a escrituras obsoletas de clientes normales, no a una promesa de libro inmutable frente a un propietario o cliente comprometido.

## Orden recomendado y puertas de publicación

No se ejecutó ninguno de estos pasos en producción.

1. **Sellar el par candidato cliente/Rules.** Registrar hashes, versión, pruebas y manifiesto; conservar una copia verificable del cliente y Rules de recuperación. Antes de publicar, hacer un preflight nuevo de metadatos de Hosting/Rules y configuración del proyecto. Los archivos locales prueban compatibilidad con el build indicado; no son una consulta del estado productivo actual.
2. **Validar el paquete PWA y su actualización en staging.** Repetir las pruebas sobre los bytes sellados y el Service Worker, con sesión desbloqueada, varios dispositivos y una operación pendiente. Confirmar que la actualización no borra formularios, localStorage, IndexedDB, claves de dispositivo ni copias de recuperación. La prueba de navegador actual usa Vite, no una actualización real de Service Worker en producción.
3. **Publicar primero el cliente corregido, con autorización independiente.** Empezar por cuentas de prueba/cohorte pequeña y ampliar tras confirmar guardado local, revisiones y errores. Mantener breve esta transición: las Rules productivas anteriores seguirían admitiendo la brecha durante ella. No usar una versión o contador declarado por el cliente como frontera de seguridad.
4. **Atender instalaciones antiguas y offline antes de activar Rules globales.** Identificar las versiones mediante información técnica consentida, sin recopilar importes ni notas. Conservar pendientes y disponer de una copia recuperable antes de actualizar. Confirmar el aviso de actualización en cada PWA instalada; un dispositivo offline no recibe automáticamente el código nuevo. No cerrar sesión, borrar caché/almacenamiento ni reinstalar como primer intento.
5. **Publicar las Rules después, en una operación separada y autorizada.** El parche es global para Finanzas en la base; no implementa un canary por usuario. El despliegue gradual es el del cliente y las comprobaciones de staging/cohortes. No volver a eximir a clientes antiguos para facilitar la transición. Esperar y comprobar la efectividad del nuevo ruleset antes de anunciar la protección; los cambios no son una barrera de activación instantánea. [Gestión oficial de Rules](https://firebase.google.com/docs/rules/manage-deploy).
6. **Canary sintético posterior y observación de estados.** Escritura vigente aceptada, padre viejo/ausente rechazado, cinco movimientos tras reconexión, ausencia de publicación parcial de comercio, y cero falsos «Sincronizado». Monitorizar versiones y códigos/estados de error sin copiar contenido financiero. Ante cualquier pérdida o cambio inexplicado, detener la ampliación y preservar las versiones.

Firebase distingue las operaciones atómicas de la persistencia offline; una escritura local pendiente no equivale a una confirmación del servidor. Las pruebas y la estrategia mantienen esa distinción. [Transacciones y lotes](https://firebase.google.com/docs/firestore/manage-data/transactions), [datos offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline).

## Recuperación y dispositivos antiguos

- **Rechazo tras reconectar:** conservar la copia local y sus IDs; mantener error/offline/conflicto hasta completar la conciliación. Consultar una versión remota fresca desde un cliente compatible, comparar con la base conocida y conservar ambas versiones si hay dudas. Nunca tomar la revisión padre nueva y adjuntarla ciegamente al snapshot viejo para forzar una subida.
- **Operaciones independientes:** la fusión probada puede conservar ambas por ID y publicar con el padre actual. No volver a crear manualmente los gastos para «recuperarlos» sin comprobar antes sus IDs: se arriesgaría una doble contabilización.
- **Ambigüedad, colisiones o falta de evidencia de borrado:** resolución explícita con copias; ninguna reparación o migración masiva. No ejecutar los controles de reconstrucción sobre datos reales como parte de este despliegue.
- **Cliente antiguo sin revisión padre:** actualizar conservando almacenamiento y pendientes. Hasta entonces puede seguir teniendo datos locales, pero no debe anunciarse como capaz de confirmar nuevas escrituras financieras. Si no puede actualizarse, documentar el estado y tratar la recuperación de forma individual.
- **Rollback:** una reversión de Hosting no revierte movimientos. Mantener las Rules endurecidas siempre que el cliente de recuperación sea compatible. El publicador de `a6834e05b0a17cff` pasa la compatibilidad de escritura, pero no contiene todas las protecciones posteriores: no confundir rollback de interfaz con reparación financiera. Ante un incidente, suspender el uso financiero afectado y preservar datos; no borrar almacenamiento ni revertir automáticamente el ruleset para permitir colas obsoletas. Cualquier reversión de Rules requiere una decisión y autorización nuevas, porque reabre el riesgo ya demostrado.

## Reproducibilidad y evidencias

```powershell
npm test
npm run lint

$financeSocketDisabled = Join-Path (Get-Location) 'artifacts\no-unix-sockets'
if (Test-Path -LiteralPath $financeSocketDisabled) { throw 'La ruta de fallback TCP debe permanecer inexistente' }
$env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=$financeSocketDisabled"
firebase emulators:exec --project demo-lifeos --only firestore,auth "node scripts/run-finance-rules-regressions.mjs --browser"
```

El ajuste de Java es temporal para el proceso local, sin modificar su instalación. Los tests comprueban endpoints locales y proyectos `demo-*`; los navegadores bloquean conexiones externas. Los archivos del build público solo se leen localmente y se verifican por hash.

Evidencia local:

- `artifacts/finance-rules/application.json`, `before.rules` y `preserved-sources.json`.
- `artifacts/finance-rules/published-verification.json`.
- `artifacts/finance-rules/all-emulators.log`: 55/55.
- `artifacts/finance-rules/focused-browser.log`: 6/6 enfocadas y E2E de 19 puntos.
- `artifacts/finance-rules/unit.log`: 1.292/1.292.
- `artifacts/finance-rules/lint.log`.
- `artifacts/finance-integrity/simon-trace.json`: cantidades, IDs, revisiones y saldos por fase, incluido offline.

Las pruebas sintéticas no certifican el estado real de Christian ni de Simón. El parche ya está aplicado **solo localmente**; Firebase de producción permanece sin cambios.
