# Ciclo visual del Cervino

Las cinco escenas panorámicas activas son `cervino-panorama-madrugada.png`, `cervino-panorama-manana.png`, `cervino-panorama-dia.png`, `cervino-panorama-atardecer.png` y `cervino-panorama-noche.png`. Fueron aportadas por el usuario y se consumen localmente, sin servicios de imágenes, clima ni ubicación.

El workspace no incluye autor, URL de procedencia ni licencia. No se afirma una licencia ni permiso de redistribución; completar esa información antes de publicar o distribuir estos archivos fuera del entorno autorizado.

Los JPG anteriores y el PNG de la prueba panorámica se conservan en la carpeta, pero ya no se usan como fondos del Hero. El mapeo activo está en `src/components/visual/AlpineDayCycleBackdrop.tsx`; los límites horarios están en `src/lib/alpineDayCycle.ts`.
