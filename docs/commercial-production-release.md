# Mi negocio — entrega y publicación controlada

Estado: **BLOQUEADO para lanzamiento**. No se desplegó Hosting ni se modificó Firebase productivo.

Implementado en el cliente real: adaptador sobre el historial comercial existente; guardado en el estado del usuario con comparación de la versión local; integración con `addTransaction`; publicación conjunta `resale`/`finance` mediante el publicador transaccional existente y E2EE obligatorio. El inventario histórico se conserva separado, sin conversión implícita. El editor comercial actual admite UYU; otros historiales quedan preservados y bloqueados para edición.

La interfaz permite entradas, reposiciones, uso/pérdidas, productos/recetas, ventas, pagos/cobros parciales o completos, devoluciones, corrección de unidades de venta y reembolsos respaldados por cobros. No cambia el historial de dinero al corregir una venta: el reembolso requiere una acción explícita.

## Evidencia

- `artifacts/commercial-production/result.json`: recorrido en App real con Auth y Firestore Emulator, dos contextos de navegador, E2EE, reintento sin duplicación, revisión obsoleta rechazada, publicación inconsistente rechazada sin cambios remotos, cierre de capacidad y fallo local conservando el formulario. Clave E2EE sintética compartida entre los clientes de prueba; no se prueba nuevamente el mecanismo de recuperación de claves.
- `commercial-tests.log`: 165 pruebas comerciales y de compatibilidad aprobadas.
- `rules-tests.log`: 41 pruebas de reglas y concurrencia aprobadas, ejecutadas en serie.
- `phase-a-gap.log`: reproduce que Fase A permite una escritura aislada de Finanzas por un cliente anterior.
- TypeScript, ESLint de archivos intervenidos y build de producción verificados. La suite general se interrumpió: pruebas anteriores intentan contactar Firestore externo y quedan reintentando por fallo DNS; no se declara aprobada.
- SHA-256 de `firestore.rules`: `7A857D864CCEA269D23FBD76633D56AF96CAF1611904F5D5D1F0BF6197418404`, idéntico al manifiesto local del ruleset publicado `ceac12af-8d3c-4b1e-9f59-b20ef36b5d7c`. No se consultaron datos personales ni se verificó nuevamente el release remoto.

## Defectos que impiden lanzar

1. Fase A protege `resale`, pero no exige actualizarlo cuando un cliente anterior escribe únicamente `finance`. Puede desaparecer un movimiento financiero comercial sin cambiar su referencia comercial. La validación del cliente nuevo no protege contra ese cliente anterior.
2. El contrato durable actual no representa anulación/devolución de compras ni reembolso de proveedor. No se implementó una baja ficticia que deje una obligación o un saldo incorrecto.
3. El contrato actual no representa reversión/corrección de un pago o cobro erróneo independiente de una devolución comercial. Esos movimientos se protegen frente a edición/eliminación genérica en Finanzas. La corrección de unidades de venta sí funciona.

## Secuencia de publicación (no ejecutada)

1. Resolver los tres defectos, incluyendo una protección de servidor de la pareja comercial/financiera y pruebas de clientes anteriores. Repetir el recorrido E2E con el contrato final.
2. Con autorización de despliegue, distribuir el cliente compatible manteniendo `systemCapabilities/commercial` ausente o `enabled:false`. Verificar navegación, lectura y conservación de datos; intentar una operación debe informar indisponibilidad.
3. Antes de activar, probar con una cuenta sintética que escrituras antiguas a `resale`, a `finance` y a ambos sean rechazadas sin cambios parciales. El caso aislado de Finanzas falla con Fase A: no continuar mientras siga así.
4. Solo con autorización definitiva, publicar las reglas necesarias y activar la capacidad del protocolo final. Confirmar compra/pago/venta/cobro y recuperación cifrada con una cuenta sintética.
5. Ante incidentes, desactivar la capacidad y verificar rechazo de nuevas publicaciones conservando la copia local. No borrar documentos, retirar marcadores ni volver a un cliente que ignore el historial comercial. Desactivar no revierte operaciones ya confirmadas.

Reproducción local: iniciar Auth/Firestore con `firebase.gym-emulator.json` y proyecto `demo-lifeos`; iniciar Vite en `127.0.0.1:5198` con `VITE_FIREBASE_EMULATORS=1`, `VITE_FIREBASE_PROJECT_ID=demo-lifeos` y configuración Firebase demo; ejecutar `scripts/test-commercial-production-e2e.mjs` con `CHROME_PATH` apuntando al ejecutable instalado. El script usa perfiles temporales y bloquea solicitudes fuera de localhost. En este Windows, Java necesitó `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:/lifeos-no-unix-sockets` (ruta inexistente, provoca fallback TCP).
