# Descanso pausado: regresión detectada al preparar la actualización

En la Preview sintética inicial `0574fc33b5888cc4`, completar una serie, pausar el descanso y recargar mostraba nuevamente «Pausar descanso». El JSON local conservaba la pausa, pero `migrateGym` reconstruía el temporizador sin `pausedAt` ni `remainingSecondsWhenPaused`.

Se conservan esos campos ya definidos por `GymActiveTimer`, únicamente con valores numéricos finitos válidos. Cero segundos pendientes sigue siendo un valor explícito válido. No se cambia el cálculo temporal, la duración, el origen del descanso, las sesiones ni el payload sincronizado: el timer sigue siendo local. Los temporizadores heredados sin pausa mantienen su contrato.

La regresión cubre normalización repetida, backup, dos guardados/recargas, reanudación con reloj controlado, carga realizada de 0 kg y exclusión del timer del módulo sincronizado. Dos pruebas fallaban antes de la corrección. La prueba de navegador de actualización debe comprobar también el control «Reanudar descanso», para no confundir la conservación del JSON con la del estado efectivo de la interfaz.

Este ajuste necesario para una actualización segura no habilita Live: la puerta financiera de cuentas reales continúa pendiente.
