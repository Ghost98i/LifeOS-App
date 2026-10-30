# Publicación y recuperación — tandas 1, 2 y 3

Preparado el 29/10/2026. **No se publicó.** Este procedimiento corresponde al candidato `20261029T210709Z-t123-5de5252d2d00`, no al ZIP antiguo citado en `DEPLOY.md` ni al comando genérico `npm run release` (que reemplaza otro paquete).

## Paquete permanente

Desde la raíz del repositorio principal:

```powershell
$releaseRoot = (Resolve-Path 'release\consolidado-tandas-1-2-3-20261029T210709Z').Path
node (Join-Path $releaseRoot 'verify.mjs') --source (Get-Location).Path --check-production
if ($LASTEXITCODE -ne 0) { throw 'Detener: cambió el candidato, las fuentes o la referencia productiva.' }
```

La comprobación es de solo lectura. Verifica los archivos sellados, los 79 archivos desplegables, la ausencia de archivos extra, los hashes de las fuentes y que Hosting siga sirviendo la versión de referencia. También comprueba que el ruleset publicado no cambió. Requiere Node y la cuenta ya autorizada de Firebase CLI. Versiones usadas: Node 26.7.0, Firebase CLI 15.32.1, Vite 6.4.5, TypeScript 5.8.3. `FIREBASE_TOOLS_ROOT` permite indicar otra instalación de la CLI al verificador.

Si producción cambió desde la preparación, detener y renovar la comparación y el respaldo de recuperación. No modificar el manifiesto para omitir el rechazo. Si cambió el código, generar otro candidato y repetir las verificaciones afectadas; no reconstruir encima de este paquete sellado.

El paquete contiene `candidate-5de5252d2d00/dist`, configuración exclusiva de Hosting, manifiestos, verificador, procedimiento, evidencia final y una recuperación de la versión publicada. También contiene un respaldo privado del estado del repositorio. El respaldo incluye archivos locales de entorno y evidencia histórica: **la carpeta pública es solamente el `dist` del candidato**.

## Publicar, únicamente tras autorización posterior

Después de aprobar el resultado de la verificación anterior:

```powershell
firebase deploy --only hosting --project lifeosanywhere --config (Join-Path $releaseRoot 'candidate-5de5252d2d00\firebase.json') --message 'Celestian: refinamientos tandas 1, 2 y 3; 5de5252d2d00'
if ($LASTEXITCODE -ne 0) { throw 'No continuar: revisar el resultado de Firebase.' }
node (Join-Path $releaseRoot 'verify.mjs') --live
if ($LASTEXITCODE -ne 0) { throw 'La publicación no coincide con el candidato verificado: evaluar recuperación.' }
```

La configuración sellada no contiene una sección Firestore. El comando selecciona expresamente el proyecto `lifeosanywhere` y solamente Hosting. No publicar Rules, modificar capacidades comerciales, claves, índices ni datos. No se necesita instalar dependencias, compilar ni disponer de archivos temporales para publicar este paquete.

`--live` consulta solo las URLs públicas: compara SHA-256 de los 79 archivos con el candidato y comprueba rutas SPA, CSP, protección de marcos, `nosniff`, política de referencia, permisos y caché efectiva. La CLI puede añadir sus endpoints reservados de inicialización; no forman parte del código del candidato. No se valida una versión mediante el rótulo de Configuración: el build ID declarado por Vite actualmente no se utiliza en la UI y se elimina al compilar. La identidad se comprueba por los hashes de contenido.

Abrir `https://lifeosanywhere.web.app` en un perfil nuevo y en el dispositivo habitual. En una instalación existente, terminar de guardar formularios y usar **Actualizar ahora** cuando aparezca el aviso. Comprobar acceso a las ocho pantallas, datos históricos visibles, notas y herramientas, sonido de Estudios, temas y modo offline tras instalar los recursos. En Configuración distinguir cuenta conectada, sesión desbloqueada, verificación de nube, sincronización y copias: un estado desconocido debe seguir mostrándose como desconocido. No forzar renovaciones de clave, restauraciones ni reinicios para hacer esta comprobación.

La validación con cuenta y datos reales debe ser una revisión del usuario; las pruebas automatizadas de esta preparación utilizan datos sintéticos y emuladores. El comportamiento de Google y de dispositivos físicos se confirma después de publicar, sin atribuir a las pruebas locales una cobertura que no tienen.

## Recuperar Hosting

Referencia comprobada antes de publicar:

- Proyecto/sitio: `lifeosanywhere`.
- Versión: `sites/lifeosanywhere/versions/2e1ecbaa50ebf62a`.
- Release: `sites/lifeosanywhere/releases/1793283346252000`, del **29/10/2026 14:15:46 UTC**.
- Ruleset compatible comprobado: `projects/lifeosanywhere/rulesets/a18d151b-181f-4b64-a2c8-f17049dc6430`.

Opción preferida: en [Firebase Hosting](https://console.firebase.google.com/project/lifeosanywhere/hosting), localizar esa versión en el historial y elegir **Roll back**. Firebase crea un nuevo release que sirve la versión anterior retenida; no reconstruye las fuentes. Es el mecanismo [documentado por Firebase](https://firebase.google.com/docs/hosting/manage-hosting-resources#rollback).

Alternativa si la versión dejara de estar retenida: volver a publicar el contenido local recuperado, sin depender de descargarlo nuevamente ni compilarlo:

```powershell
node (Join-Path $releaseRoot 'verify.mjs') --rollback
if ($LASTEXITCODE -ne 0) { throw 'La copia de recuperación no pasó su verificación.' }
firebase deploy --only hosting --project lifeosanywhere --config (Join-Path $releaseRoot 'rollback-20261029T210900396Z\firebase.json') --message 'Recuperación de la versión 2e1ecbaa50ebf62a'
if ($LASTEXITCODE -ne 0) { throw 'Revisar la recuperación en Firebase.' }
node (Join-Path $releaseRoot 'verify.mjs') --rollback --live
```

La recuperación local contiene los **79 archivos estáticos** publicados, verificados contra los hashes gzip de Hosting, y la configuración original reconstruida y validada con el conversor de la CLI. `/__/firebase/init.js` e `init.json` son [URLs reservadas gestionadas por Firebase](https://firebase.google.com/docs/hosting/reserved-urls): sus respuestas públicas no equivalen a los archivos ocultos subidos con esos nombres. Se documentaron por separado y no se presentan como copias estáticas exactas. El rollback retenido recupera la versión completa; la alternativa local recupera la aplicación y su configuración, manteniendo esos endpoints bajo gestión de Firebase.

Después de recuperar, confirmar hashes y cabeceras, aceptar el aviso de actualización y revisar que los datos sigan disponibles. No borrar almacenamiento del sitio ni restaurar datos personales para revertir la interfaz. La prueba local de actualización y vuelta atrás conservó notas escritas por ambas versiones, finanzas, comercio, estudios, empleo, proyectos y objetivos. Una recuperación de Hosting no deshace operaciones personales realizadas después del despliegue.

## Respaldo del repositorio

`base.bundle` conserva la historia y referencias de Git. `increment.zip` guarda los archivos modificados y sin seguimiento, además de los `.env` locales existentes, con bytes exactos; `source-state.json` registra estado, eliminaciones y SHA-256 de los 3.325 archivos inventariados. Se verificaron todos los archivos del ZIP y el bundle. `git-index.snapshot`, `working.patch` y `staged.patch` documentan el estado del índice y las diferencias.

Los directorios ignorados de dependencias, builds y paquetes anteriores quedaron en su lugar; están inventariados y no se copiaron recursivamente. El respaldo es incremental respecto de la base de Git, no una copia de datos remotos. No se sobrescribieron respaldos previos. Una recuperación de fuentes requiere revisar primero los hashes y diferencias, conservar cualquier trabajo posterior y superponer el incremento sobre su base correcta en el repositorio autorizado. No ejecutar un reset ni reemplazar el índice automáticamente sobre trabajo nuevo.

`backup-checksums.json` verifica el bundle, ZIP y archivos de respaldo. `package-checksums.json` y su suma externa verifican además candidato, recuperación, herramientas y evidencia. Estos archivos, el paquete y las instrucciones son permanentes dentro de `release/`; no dependen del servidor Vite ni de carpetas temporales.
