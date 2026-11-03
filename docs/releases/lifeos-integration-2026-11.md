# Preparación de integración de LifeOS — noviembre 2026

Base de fuente: `e97e8c5da8bf4d5cd8b0966f565cdc59e45021f3`.

Se conserva el desarrollo completo de Gimnasio desde `feat/gimnasio-refinement-2026-11`, incluidos los informes `gym-functional-closure.md`, `gym-visual-final.md` y sus pruebas. Los cambios originales permanecen en su worktree; este checkpoint no limpia ni sobrescribe esa rama. Los recursos y créditos se preservan exactamente como estaban.

Esta rama prepara la integración de Gimnasio sobre LifeOS completo. No contiene una aprobación de publicación. Finanzas requiere evaluar separadamente el tip `03076a81e1b365caf019454590fa396214d590f7`: elimina las inferencias automáticas del antecedente `002c3cd3c143`, pero no demuestra la integridad de monedas que versiones antiguas ya pudieron persistir.

La política financiera vigente distingue un GO técnico con fixtures de la revisión de cuentas reales, que permanece pendiente. No se accede a datos privados, no se atribuyen monedas históricas y no se declara reparada ninguna cuenta. Una unión técnica con Finanzas podrá validarse en una rama candidata y una Preview aislada, sin habilitarla automáticamente para Live.

No se modifican Firestore Rules, esquema, cifrado ni configuración de autenticación. Los resultados previos de pruebas son antecedentes: la integración debe ejecutar nuevamente sus validaciones y registrar el commit del artefacto construido.
