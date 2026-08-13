# Publicar LifeOS Anywhere

El ZIP comprobado ya contiene `dist`, `firebase.json` y `firestore.rules` en la estructura correcta. En Google Cloud Shell, subilo y ejecutá exactamente:

```bash
rm -rf ~/lifeos-release
mkdir ~/lifeos-release
unzip -o ~/lifeos-anywhere-checked.zip -d ~/lifeos-release
cd ~/lifeos-release
firebase deploy --only hosting,firestore:rules --project lifeosanywhere
```

El comando publica Hosting y las reglas que separan los datos por usuario. Si Firebase rechaza una validación, no completa el despliegue.

Después:

1. Abrí `https://lifeosanywhere.web.app`.
2. Actualizá la página una vez. Si aparece el aviso de versión nueva, tocá **Actualizar ahora**.
3. Conectá la misma cuenta de Google en PC y celular.
4. Creá una nota de prueba en un dispositivo y verificá que aparezca en el otro.

No vuelvas a ejecutar `npm install` ni a entrar manualmente en una carpeta `dist`: el paquete ya está compilado.
