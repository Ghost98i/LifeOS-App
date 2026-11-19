# Digital Asset Links (TWA)

Este archivo no se sirve al público como documentación: `assetlinks.json` es el que usa Android
para verificar que la app instalada desde Google Play puede abrir el sitio sin barra de navegador.

## Completar antes de publicar

1. Elegí el `package_name` definitivo (ahora: `com.celestian.lifeos`). Debe coincidir exactamente
   con el `applicationId` del proyecto Android generado con Bubblewrap o PWABuilder. Una vez
   publicado en Play no conviene cambiarlo.
2. Reemplazá la huella de ejemplo por la huella **SHA-256 de la App signing key** que muestra
   Play Console en *Test and release → Setup → App signing*. Si probás una build local o de
   prueba interna firmada con tu upload key, agregá también esa huella a la lista.
3. Verificá que el archivo se publique en `https://TU_DOMINIO/.well-known/assetlinks.json`
   (ver sección Firebase de `docs/PLAY-STORE.md`).

## Obtener la huella

```bash
# Keystore local (upload key):
keytool -list -v -keystore upload-keystore.jks -alias upload | grep SHA256

# App signing key de Play: Play Console → Test and release → Setup → App signing
```

El formato es `AA:BB:CC:...` (32 pares hexadecimales separados por dos puntos).
