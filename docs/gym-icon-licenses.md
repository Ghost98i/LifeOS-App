# Gimnasio: verificación de procedencia y licencias

Revisión: 2 de noviembre de 2026. No se descargaron ni sustituyeron recursos, ni se modificaron SVG, animaciones o atribuciones existentes. Este documento registra evidencia; no concede derechos sobre archivos de terceros.

## Catálogo SVG de ejercicios y equipamiento

Se inspeccionaron los 22 archivos de `public/gym-icons/v1/`, sus metadatos XML, textos, enlaces y el paquete original conservado en `artifacts/gym-visual-proposals/LifeOS_Gym_SVG_encuadres_ajustados_V1/`. El paquete contiene originales, ajustes de encuadre y un informe geométrico; su `LEEME.txt` advierte que hay múltiples autores y exige verificar licencias. No incorpora una licencia por archivo ni comprobantes de adquisición. Ninguno de los 22 SVG contiene un enlace de procedencia específico.

Inventario individual, hashes SHA-256 y textos encontrados: [icon-provenance.json](../artifacts/gym-visual-final/icon-provenance.json).

| Recurso | Evidencia comprobada | Resultado |
|---|---|---|
| `adjustable-bench.svg` | Texto incorporado: «Created by Oleksandr Panasovskyi» y «from the Noun Project». Existe el [perfil oficial de ese creador](https://thenounproject.com/creator/a.panasovsky). | Autor identificado; no se pudo vincular con certeza el archivo a una ficha específica ni a la licencia de descarga adquirida. Sigue pendiente. |
| `pull-ups.svg` | El README anterior indica una combinación de recursos; el SVG no identifica autores ni licencias de sus partes. | Debe acreditarse el origen y permiso de cada parte; no basta con dar crédito genérico a un sitio. |
| Los otros 20 SVG | No contienen autor, licencia ni enlaces específicos. «Layer 1» en algunos archivos es un nombre de capa, no una atribución. | No se pueden certificar mediante la silueta, el nombre del archivo ni la presencia del recurso en el repositorio. |

Noun Project publica varias modalidades; no corresponde asignar CC BY a un archivo únicamente por identificar al autor. Su [guía oficial de licencias](https://help.thenounproject.com/hc/en-us/articles/200509798-What-licenses-do-you-offer-for-icons) diferencia atribución, licencias de pago y dominio público. La [guía de créditos](https://help.thenounproject.com/hc/en-us/articles/200509928-How-do-I-give-creators-credit-in-my-work) requiere identificar ícono, creador, procedencia y licencia con los enlaces correspondientes cuando se usa su modalidad gratuita. El texto diminuto incorporado en un SVG renderizado como máscara no prueba una atribución legible para la persona usuaria.

Para cerrar estos casos hace falta la URL/ficha original y la licencia correspondiente, o un comprobante de adquisición/autorización que identifique los recursos. No se inventaron autores, códigos de licencia ni fechas. El registro mantiene sus estados `pending`/`pending-attribution`; no se los marcó como resueltos.

## Íconos de interfaz ya compartidos por LifeOS

`AppIcon.tsx` importa recursos locales de Icons8. Hay un crédito visible con enlace en `ConfigView.tsx`, además del comentario de atribución en el código. No se modificó ese componente compartido.

La [guía oficial de Icons8](https://icons8.com/license) distingue dónde debe mostrarse el enlace según el medio. La [documentación oficial del MCP](https://intercom.help/icons8-7fb7577e8170/en/articles/13569445-what-s-the-icons8-mcp-server) diferencia PNG gratuitos con enlace y SVG de pago. Se verificó la presencia del crédito en LifeOS, pero no hay evidencia suficiente en los materiales revisados para certificar la adquisición de cada SVG, ni para asumir que cualquier descarga SVG queda autorizada solo por añadir el enlace. Tampoco se extendió la licencia de Icons8 a los SVG del catálogo de ejercicios, cuya procedencia no está establecida.

## Animaciones de Gimnasio relacionadas con los íconos

Aunque no se cambiaron, se contrastaron las referencias pendientes más cercanas al flujo revisado:

| Archivo local | Comprobación | Límite |
|---|---|---|
| `gym-pr-trophy.lottie` | La [ficha oficial Trophy](https://lottiefiles.com/free-animation/trophy-yEGPe40FVr) identifica a Mahendra Bhunwal y publica la Lottie Simple License. El archivo local se llama internamente «Trophy» y el README ya cita esa ficha. | Se verificó la licencia publicada en esa fuente; no se hizo comparación binaria con una descarga nueva. |
| `gym-streak-fire.lottie` | La [ficha oficial Fire Streak Orange](https://lottiefiles.com/free-animation/fire-streak-orange-HEj0rht12V) identifica a Dhawal Patel y publica la misma licencia. Los metadatos locales también identifican a Dhawal Patel y «Streak Fire». | Mismo límite de correspondencia binaria; se conservó el crédito existente. |
| `lifeos-micro-check-violet.json` y `gym-workout-success.lottie` | El paquete local conserva los archivos y hashes, pero no autor ni ficha de origen verificable. | Siguen pendientes. Que tengan formato Lottie o se generaran con su editor no demuestra que les corresponda la licencia de las animaciones públicas de la comunidad. |

La [Lottie Simple License oficial](https://lottiefiles.com/page/license) permite usos comerciales y modificaciones, manteniendo sus términos en la distribución; la atribución es opcional, aunque recomendada. Esa comprobación no se usa para licenciar por extensión archivos cuyo origen no consta.

## Dictamen y tratamiento (Actualizado el 19 de noviembre de 2026 — NO-GO levantado)

La auditoría inicial del 2 de noviembre de 2026 mantuvo un **NO-GO** mientras los SVG de `public/gym-icons/v1/` y las animaciones `lifeos-micro-check-violet.json` / `gym-workout-success.lottie` carecían de licencia verificable.

El **19 de noviembre de 2026 (Etapa B)** se reemplazó de raíz todo el material pendiente por recursos **100 % originales de Celestian LifeOS**:

1. **Catálogo SVG de Gimnasio (`public/gym-icons/v1/`):** los 34 SVG previos (incluyendo los 22 auditados inicialmente, `adjustable-bench.svg` y `pull-ups.svg`) fueron reemplazados por **39 íconos SVG propios** de equipamiento mecánico/industrial (`viewBox="0 0 64 64"`, cero siluetas humanas, sin metadatos ni textos de terceros), registrados con `licenseStatus: 'first-party-original'` en `src/lib/gymIconRegistry.ts`.
2. **Animaciones Lottie observadas (`public/motion/`):** se reemplazaron `lifeos-micro-check-violet.json`, `lifeos-micro-check-fast-violet.json` y `gym-workout-success.lottie` (eliminado y sustituido por `gym-workout-success.json`) por animaciones JSON propias con finales de línea LF y hashes verificados en `src/lib/motion.test.ts`.
3. **Resolución:** **GO** para la distribución del catálogo SVG de Gimnasio y las animaciones propias reemplazadas. Queda únicamente como verificación separada de interfaz general la cobertura de licencia SVG de Icons8 en `src/assets/icons/icons8/` (y `public/motion/lifeos-task-*`), ajena a los recursos de Gimnasio ya sustituidos.
