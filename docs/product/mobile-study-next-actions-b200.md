# B200 — Próximos pasos de estudio en Mobile

## Qué cambia

La Agenda de estudio móvil muestra la primera tarea pendiente de cada plan
privado. Cada elemento expone el título del plan, el tipo de referencia, los
minutos estimados y el total de tareas pendientes. La persona puede abrir la
pregunta o el apunte desde la tarjeta.

## Acceso y privacidad

- Usa `GET /study-progress/me/next-actions`, autenticado y limitado a los
  planes del dueño de la sesión. El cliente no envía identificadores de cuenta.
- No muestra contenido del apunte ni de la pregunta dentro de la agenda.
  Navega a las pantallas canónicas de detalle, que vuelven a comprobar acceso,
  existencia y moderación.
- Los UUID inválidos no crean enlaces navegables. Cambio de sesión, cierre de
  pantalla y pérdida de foco cancelan y cercan respuestas tardías.
- Un fallo de esta bandeja queda separado del estado de la agenda: conserva
  las sesiones visibles y ofrece reintento sólo para fallos recuperables.
- Reutiliza `EXPO_PUBLIC_STUDY_AGENDA_ENABLED`, apagada por defecto. El servidor
  mantiene su `STUDY_PROGRESS_ENABLED` independiente.

## Validación

- El contrato de `GET /study-progress/me/next-actions` está en
  `docs/contracts/study-next-actions-http-b171.md`.
- No agrega endpoints, escrituras, almacenamiento, dependencias, permisos,
  workflows ni cambios de configuración del servidor.
- La aceptación local y los SHA exactos del carrier se documentan en la PR.
