# LifeOS

LifeOS es un centro de operaciones personal. No busca almacenar información por acumularla: conecta datos y los convierte en próximas acciones con la menor fricción posible.

## Principios

- El Dashboard es el único lugar que interpreta y prioriza.
- Los módulos registran y consultan información.
- Un dato se escribe una sola vez y se reutiliza en todos los flujos.
- La aplicación funciona sin IA, backend ni suscripciones.
- La IA es opcional y externa: LifeOS genera un prompt, cualquier IA devuelve JSON y la persona revisa la importación.
- Las funciones nuevas deben aportar una mejora concreta al uso diario.

## Desarrollo

```bash
npm install
npm run dev
```

Validaciones disponibles:

```bash
npm run lint
npm test
npm run build
```

## Datos y backups

Los datos se guardan localmente en el navegador bajo la clave `lifeos-state-v1`. El esquema actual tiene versión explícita y migra estados anteriores al cargarlos. Antes de reemplazar el estado guardado se conserva una copia local de recuperación.

Configuración permite:

- exportar un backup JSON;
- importar únicamente backups reconocidos como LifeOS;
- diagnosticar tamaño, versión y disponibilidad de la copia de recuperación.

El almacenamiento local sigue ligado al navegador y dispositivo. El backup JSON es la copia portátil.

## Flujo de IA

1. Copiar el prompt desde el módulo IA.
2. Ejecutarlo en ChatGPT, Claude, Gemini u otro proveedor.
3. Pegar la respuesta JSON en LifeOS.
4. Validar y previsualizar.
5. Confirmar la importación.

Las oportunidades laborales conservan empresa, puesto, link y nota al transformarse en postulaciones. Las oportunidades de reventa pasan al inventario sin volver a escribir sus datos.
