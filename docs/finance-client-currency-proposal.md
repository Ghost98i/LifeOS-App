# Propuesta no activada: contrato de cliente financiero y despliegue gradual

Estado: sólo investigación, experimento local y propuesta. No se cambiaron Rules, protocolo, claves, envelopes, metadatos de la aplicación ni se publicó nada. `CURRENT_SYNC_PROTOCOL_VERSION` continúa en 2. El protocolo comercial 3 mantiene su contrato actual.

## Qué puede comprobar el servidor hoy

Las Rules autentican al propietario y validan forma del documento, envelope cifrado, revisión padre vigente y protocolo no decreciente del head financiero. `preservesFinanceProtocol` exige `next >= previous`. El head no se puede eliminar desde un cliente. `deviceId`, `schemaVersion`, `clientUpdatedAt` y `syncProtocolVersion` no acreditan qué binario se ejecutó: son valores elegidos por el cliente autenticado.

La aplicación actual y clientes anteriores a la política monetaria publican el mismo protocolo 2. Una pérdida de currency dentro del cifrado es invisible al servidor. Con la misma revisión padre, ambos son indistinguibles para las Rules. Las revisiones padre evitan sobrescribir un head concurrente obsoleto; no garantizan la calidad semántica de un payload construido a partir del head vigente.

Un nuevo número sólo protege si el servidor impide volver al contrato anterior. La guarda no decreciente existente ofrece ese mecanismo por documento, pero aún no hay un contrato publicado que distinga esta política. Una app que afirmara soportar el número nuevo sin cumplir su semántica podría seguir enviando contenido incorrecto: Firebase Auth autentica al usuario, no al software. No se propone presentar esto como atestación del cliente ni como validación de moneda en servidor.

## Experimento de compatibilidad reproducido

`src/lib/financeCurrencyPolicy.emulator.test.ts`, ejecutado exclusivamente en Auth/Firestore de `demo-lifeos` y loopback, usando las Rules locales sin modificar:

1. El writer actual publica un head financiero cifrado con protocolo 2.
2. Un productor sintético publica el mismo envelope con **protocolo experimental 4** y parent vigente. Las Rules lo aceptan.
3. El lector local actual rechaza el head 4 como incompatible.
4. Una escritura de protocolo 2 con el parent **correcto** es rechazada por las Rules con `permission-denied`. No es un rechazo causado por parent obsoleto.
5. Una escritura que declara 4 con el mismo contenido cifrado es aceptada. Esto prueba también que el número no certifica el contenido ni el productor.
6. El writer local actual rechaza publicar frente a ese head y conserva el estado local sintético sin alterarlo.

Resultado del ejecutor: **5/5 pruebas de emuladores**, incluyendo esta prueba, conservación de currency, revisiones cifradas, duplicados y reconexión. El experimento no es una activación de protocolo 4 en LifeOS ni una prueba de dos binarios publicados distintos. Comprueba contratos wire 2/4 y las guardas del cliente actual. La conservación anterior ya tiene además una simulación de productor antiguo que elimina currency manteniendo protocolo 2: no se repitió ni reconstruyó esa protección.

## Contrato candidato, sujeto a aprobación

Reservar un contrato financiero 4, exclusivamente para `finance`, que exija al productor:

- Conservar currency explícito en lecturas, backups, escrituras y uniones.
- Mantener ausencias/códigos no confirmados como tales; no asignar UYU por omisión.
- Separar importes confirmados de ocurrencias no certificadas y comunicar proyecciones parciales.
- No confirmar nuevos pagos/cobros ni vínculos sin moneda confirmada.
- Conservar operaciones locales y recuperación al recibir un rechazo de compatibilidad. Un guardado local no equivale a un acuse remoto.

No basta con incrementar la constante global: eso afectaría otros módulos y el protocolo comercial 3. Se necesita un contrato de lectura/escritura **por módulo**, compatible con los documentos comerciales existentes y con el envelope/AAD actual. El contrato no recuperaría currency ya perdido ni exigiría completar históricos ambiguos para leerlos de manera segura.

## Plan gradual propuesto

1. **Preparación:** probar en staging/emuladores una versión que lea los contratos financieros 1/2/3/4 permitidos, aplique esta política y todavía escriba el contrato anterior. Auditar también el build realmente distribuido, las rutas comerciales y la persistencia de trabajo offline. No cambiar Rules ni activar 4 en esta fase.
2. **Actualización:** distribuir ese lector compatible. La PWA actual usa `registerType: prompt`, `skipWaiting: false` y `clientsClaim: false`: una pestaña abierta no se actualiza obligatoriamente. El aviso permite posponer y pide guardar formularios. No demuestra que todos los dispositivos estén actualizados ni que sus operaciones estén sincronizadas.
3. **Preservación de pendientes:** verificar guardado local, snapshots local/remoto/base, baselines y reprogramación de módulos. Las colas en memoria no son un diario durable independiente; tras una recarga se depende del estado persistido y su comparación con baselines. Antes de activar, comprobar fallos de almacenamiento, navegador cerrado offline, rechazos remotos y recuperación del build publicado. No borrar una cola ni afirmar sincronización por haber solicitado publicar. No forzar refresh de formularios abiertos.
4. **Activación controlada:** con autorización separada y una versión preparada, escribir el primer head 4 sobre un parent confirmado, preservando todos los datos y ambigüedades. La monotonía ya existente contendría escrituras posteriores de clientes 2/3 para ese head. Verificar antes las Rules efectivamente desplegadas; la prueba actual sólo certifica las locales. Un documento nuevo sin head 4 seguiría aceptando un cliente anterior: esto es un cierre por documento, no un mínimo global obligatorio.
5. **Seguimiento:** comprobar rechazos, pendientes y conflictos con estados sintéticos/canarios autorizados. Un cliente antiguo puede seguir degradando su copia local o mostrar mal una confirmación; el servidor puede contener su escritura sin controlar su interfaz. No prometer recuperación automática del trabajo de un binario no auditado.

## Compatibilidad y reversibilidad

No se debe anunciar un rollout global mientras existan writers no preparados que deban continuar publicando. No conocemos cuántos dispositivos activos quedan con cada build y no accedimos a producción para averiguarlo.

Una vez que un head llegue a 4, volver a desplegar un writer que sólo admite 2 no es un rollback funcional: ese writer quedaría bloqueado. La salida segura es una corrección hacia adelante que conserve el contrato 4. Bajar el protocolo o relajar Rules reabriría el riesgo. Esta consecuencia requiere una decisión explícita de despliegue, no un cambio de constante dentro del refinamiento.

No se propone un campo adicional de versión “confiable”, una migración de datos, una reparación de históricos ni una modificación de Rules de producción. Si se requiere imponer un mínimo global también a documentos nuevos, haría falta diseñar y aprobar un contrato adicional de capacidades y su despliegue. No está implementado.

## Dictamen de esta propuesta

**GO para evaluar el contrato candidato en una intervención separada; NO activado.** Hay evidencia de contención de downgrades en las Rules locales, con límites claros. **No hay garantía de coexistencia segura global con clientes antiguos**, ni una prueba de autenticidad del software basada sólo en metadatos. La política de interpretación local implementada puede seguir protegiendo al cliente actualizado sin esperar esa garantía imposible de inferir.
