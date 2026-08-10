# LifeOS

LifeOS es un centro de operaciones personal. No busca almacenar información por acumularla: conecta datos y los convierte en próximas acciones con la menor fricción posible.

## Uso diario

1. Descargar `LifeOS.html`.
2. Abrirlo con doble clic en Chrome, Edge o Firefox.
3. Usar siempre ese mismo archivo para conservar los datos del navegador.

No requiere instalar Node.js, ejecutar comandos ni mantener una terminal abierta. Antes de reemplazar el archivo por una versión nueva conviene exportar un backup desde Configuración.

## LifeOS Anywhere

La versión alojada puede instalarse como PWA en Windows y Android y comparte los datos usando la misma cuenta de Google. Mantiene una copia local para funcionar sin conexión y sincroniza los cambios cuando vuelve Internet.

Para activarla se necesita un proyecto Firebase del propietario con Authentication (Google), Firestore y Hosting. La configuración pública de la aplicación web se copia desde `.env.example` a `.env.local`. Las reglas incluidas limitan cada documento al usuario autenticado correspondiente.

El primer dispositivo con datos puede subir su estado existente. Si LifeOS detecta datos distintos en el dispositivo y en la nube, pide elegir antes de reemplazar cualquiera de las versiones.

## Principios

- El Dashboard es el único lugar que interpreta y prioriza.
- Los módulos registran y consultan información.
- Un dato se escribe una sola vez y se reutiliza en todos los flujos.
- La aplicación funciona sin IA, backend ni suscripciones.
- La IA es opcional y externa: LifeOS genera un prompt, cualquier IA devuelve JSON y la persona revisa la importación.
- Las funciones nuevas deben aportar una mejora concreta al uso diario.

## Flujos cotidianos

- **Captura universal:** el botón central guarda tareas, notas, ingresos o gastos sin buscar una pestaña.
- **Hoy:** separa tres prioridades reales del resto de la lista y registra sueño, energía y conexión personal. Resume los últimos siete días y avisa al detectar tres noches cortas consecutivas.
- **Finanzas:** distingue movimientos de transferencias, permite conciliar cuentas y conserva los ajustes fuera del gasto mensual.
- **Reventa:** una compra descuenta la cuenta; una venta registra cobro, costos y ganancia realizada sin duplicar datos.
- **Búsqueda global:** `Ctrl+K` en PC o la lupa en el celular encuentra información en todos los módulos.
- **Revisión semanal:** muestra únicamente vencimientos, stock inmóvil, cuentas sin conciliar, presupuestos excedidos y otras excepciones.
- **Composición corporal:** reemplaza el IMC visible por una estimación RFM basada en altura y cintura, y usa ese resultado junto con el peso para calcular masa grasa, masa magra y FFMI.

## Desarrollo interno

```bash
npm install
npm run dev
```

Validaciones disponibles:

```bash
npm run lint
npm test
npm run build
npm run build:portable
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
