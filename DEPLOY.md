# Publicar LifeOS Anywhere

El ZIP comprobado ya contiene `dist`, `firebase.json` y `firestore.rules` en la estructura correcta. Las reglas nuevas bloquean escrituras con revisiones antiguas: publicá Hosting primero y actualizá tus dispositivos antes de activarlas.

```bash
lifeos_deploy_dir="$(mktemp -d)"
unzip -o ~/lifeos-anywhere-v7-overhaul-20260902-r2.zip -d "$lifeos_deploy_dir"
cd "$lifeos_deploy_dir"
firebase deploy --only hosting --project lifeosanywhere
```

El comando publica Hosting y las reglas que separan los datos por usuario. Si Firebase rechaza una validación, no completa el despliegue.

Después:

1. Abrí `https://lifeosanywhere.web.app`.
2. Actualizá la página una vez. Si aparece el aviso de versión nueva, tocá **Actualizar ahora**.
3. Confirmá en Configuración que PC y celular muestran el build `20260902T1421`.
4. Conectá la misma cuenta de Google y creá una nota de prueba en un dispositivo.
5. Cuando aparezca en el otro, activá la protección concurrente:

```bash
firebase deploy --only firestore:rules --project lifeosanywhere
```

No vuelvas a ejecutar `npm install` ni a entrar manualmente en una carpeta `dist`: el paquete ya está compilado.
