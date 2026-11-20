# Publicar Celestian LifeOS en Google Play (TWA)

Estado de esta preparación: **19 de noviembre de 2026**.

LifeOS ya es una PWA instalable y funcional. Empaquetarla como TWA (Trusted Web Activity) es
técnicamente posible y no requiere reescribir la app: la APK/AAB es un contenedor que abre el sitio
publicado en Chrome. Lo que falta no es código de la app, sino **firma, cuentas, formularios y
evidencia de licencias**.

## 1. Lo que ya está listo

| Requisito | Estado |
| --- | --- |
| `name` / `short_name` | `Celestian LifeOS` / `LifeOS` |
| `start_url`, `scope`, `display` | `/`, `/`, `standalone` |
| `orientation` | `portrait` |
| `theme_color` / `background_color` | `#07090E` |
| Iconos 192 y 512, `any` | `public/lifeos-icon-192.png`, `public/lifeos-icon-512.png` (opacos, sin transparencia) |
| Icono 512 `maskable` | `public/icon-512-maskable.png`, con el glifo centrado al ~70 % |
| Service worker / offline | Workbox, actualización con aviso; panoramas del Hero en caché bajo demanda |
| Política de privacidad pública | `/privacidad.html` |
| Eliminación de cuenta pública | `/eliminar-cuenta.html` + flujo dentro de la app |
| Digital Asset Links | plantilla en `public/.well-known/assetlinks.json` |
| Hosting con JSON correcto | `firebase.json` sirve `/.well-known/assetlinks.json` como `application/json` |

## 2. Bloqueantes reales antes de subir a Play

1. **Licencias de recursos de Gimnasio y Lotties (RESUELTO — NO-GO levantado el 19/11/2026).**
   Todos los SVG de equipamiento en `public/gym-icons/v1/` (39 archivos en estilo industrial/mecánico, sin figuras humanas) y las animaciones `lifeos-micro-check-violet.json`, `lifeos-micro-check-fast-violet.json` y `gym-workout-success.json` (eliminado el `.lottie` previo sin licencia) son ahora obras **100 % originales de Celestian LifeOS**. Verificá únicamente antes de publicar que la suscripción de Icons8 cubra los SVG generales de interfaz en `src/assets/icons/icons8/` (y los 3 archivos de check de tareas en `public/motion/lifeos-task-*`) o reemplazalos por íconos MIT/propios.
2. **Correo de contacto en la política.** `public/privacidad.html` y `public/eliminar-cuenta.html`
   contienen `TU_CORREO_DE_CONTACTO`. Play exige una vía de contacto real. Reemplazalo antes de
   publicar.
3. **Eliminación de datos en la nube.** Ya está implementada: Configuración → Cuenta →
   Privacidad y seguridad → **Eliminar cuenta y datos en la nube** detiene la sincronización, borra
   `users/{uid}/lifeosModules/*`, `lifeosRevisions/*` y `lifeosAccount/*`, cierra la sesión de
   Google y permite elegir si se conservan o eliminan los datos locales. La página pública
   `/eliminar-cuenta.html` cubre el caso de quien ya desinstaló la app.
4. **Firma y `package_name` definitivos.** Hay que elegir el ID (la plantilla usa
   `com.celestian.lifeos`) y cargar las huellas SHA-256 reales. Si usás Play App Signing, la huella
   que cuenta es la de **App signing key**, no la de tu upload key.
5. **Cuenta de desarrollador y prueba cerrada.** Cuenta de Play ($25, verificación de identidad).
   Las cuentas personales nuevas deben pasar 12 testers durante 14 días en prueba cerrada antes de
   producción.
6. **Acceso para revisores.** La app requiere iniciar sesión con Google. En Play Console, sección
   *App access*, hay que entregar credenciales de una cuenta de prueba y los pasos exactos. Si no,
   el rechazo es casi seguro.
7. **Ficha de Play:** icono 512×512, gráfico destacado 1024×500, al menos 2 capturas de teléfono,
   descripción corta y completa, clasificación de contenido y formulario **Data safety**.

## 3. Empaquetado con Bubblewrap

Requisitos: JDK 17+, Android SDK (o Android Studio) y una URL pública con HTTPS.

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://lifeosanywhere.web.app/manifest.webmanifest
# applicationId: com.celestian.lifeos
# display mode: standalone
# signing: crear keystore nueva y guardarla fuera del repositorio

bubblewrap build          # genera app-release-signed.apk y .aab
bubblewrap install        # prueba en un dispositivo conectado
```

Alternativa sin terminal: <https://www.pwabuilder.com> permite generar el paquete Android a partir
de la URL del manifest. El resultado es equivalente, pero igual hay que completar `assetlinks.json`.

No guardes el keystore, las contraseñas ni el `.aab` en el repositorio.

## 4. Completar y verificar Digital Asset Links

1. Completá `public/.well-known/assetlinks.json` con el `package_name` y las huellas SHA-256.
2. `npm run build` y desplegá Hosting.
3. Verificá que se sirva sin redirección y con el tipo correcto:

```bash
curl -I https://lifeosanywhere.web.app/.well-known/assetlinks.json
# HTTP/2 200
# content-type: application/json; charset=utf-8
```

4. Validá la lista en
   <https://developers.google.com/digital-asset-links/tools/generator>.
5. Instalá la APK en el teléfono. Si la verificación funciona, la app abre sin barra de navegador.

### Por qué el rewrite de la SPA no rompe esto

Firebase Hosting sirve primero los archivos estáticos de `dist` y solo aplica el rewrite
`.* → /index.html` cuando no existe un archivo. Por eso `/.well-known/assetlinks.json` se entrega
tal cual. El riesgo real era otro: `firebase.json` ignoraba `**/.*`, lo que excluía `.well-known`
del deploy. Ese patrón se quitó. **No lo vuelvas a agregar.**

Además, `appAssociation` quedó en `NONE`. Con el valor por defecto (`AUTO`), Firebase puede generar
dinámicamente un `assetlinks.json` vacío (`[]`) y tapar el archivo real. Y se agregó un rewrite
explícito para la ruta, antes del catch-all de la SPA, para dejar la intención documentada.

El service worker tampoco lo intercepta: `globIgnores` y `navigateFallbackDenylist` excluyen
`/.well-known/` del precache y del fallback de navegación.

## 5. Inicio de sesión de Google dentro de la TWA

Una TWA usa Chrome, así que Google Sign-In no está bloqueado como en un WebView. Aun así:

- `signInWithPopup` puede quedar bloqueado por el manejo de ventanas de Android.
- El código ya cae automáticamente a `signInWithRedirect` en ese caso.
- Para que el redirect vuelva a la app, la verificación de `assetlinks.json` tiene que estar
  aprobada. Probalo en un dispositivo real: iniciar sesión → cerrar la app → abrirla de nuevo.
- Como la TWA comparte el perfil de Chrome, si ya iniciaste sesión en el sitio desde Chrome, la
  sesión también estará disponible en la app.

## 6. Formulario Data safety (orientativo)

Declarar según lo que realmente hace la app:

- **Información personal:** nombre y correo electrónico (provistos por Google Sign-In), usados para
  administrar la cuenta. No se comparten con terceros con fines publicitarios.
- **Información financiera:** montos, cuentas y movimientos ingresados por el usuario.
- **Salud y fitness:** rutinas, pesos, medidas corporales y sueño.
- **Contenido del usuario:** notas, tareas, proyectos, estudios, postulaciones.
- **Datos cifrados en tránsito:** sí (HTTPS/TLS).
- **Eliminación de datos:** la URL de la política + `/eliminar-cuenta.html` + el flujo dentro de la app.
- **Publicidad o rastreo:** no.

No declares analítica ni publicidad: la app no las usa.

## 7. Orden recomendado

1. ~~Resolver licencias de recursos de Gimnasio y Lotties~~ (**completado en Etapa B**; verificar cobertura de suscripción Icons8 para `AppIcon.tsx` si aplica).
2. Completar el correo de contacto real y verificar el flujo de eliminación de cuenta.
3. Elegir `package_name`, generar keystore y subir el primer AAB a prueba interna.
4. Completar `assetlinks.json` con la huella de Play App Signing y verificar.
5. Completar la ficha, Data safety, clasificación y acceso para revisores.
6. Ejecutar `npm run lint && npm test && npm run build` sobre el commit exacto que se publica.
7. Prueba cerrada con 12 testers durante 14 días.
8. Producción.
