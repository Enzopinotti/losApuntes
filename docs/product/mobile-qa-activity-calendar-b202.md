# B202 — Calendario privado de actividad Q&A en Mobile

## Qué cambia

El Perfil móvil muestra los últimos 28 días de participación visible en Q&A.
El resumen separa preguntas y respuestas, y presenta los días en una cuadrícula
semanal con conteos accesibles.

## Contrato y límites

- Usa `GET /qa/me/activity-calendar`; el servidor deriva el dueño de la sesión
  y no acepta fechas, identificadores de cuenta ni zonas horarias del cliente.
- La app verifica las 28 fechas UTC consecutivas, el tamaño de la ventana y que
  los conteos sumen correctamente antes de mostrarlos.
- La vista incluye sólo preguntas visibles y respuestas cuyo hilo de origen
  sigue visible. No incluye texto, autores externos, materias ni IDs.
- La tarjeta sólo carga con el Perfil autenticado activo; cancela y cerca
  resultados al cambiar de sesión, salir de la pantalla o suspender la app.
- Los conteos no representan asistencia, conocimiento, rachas, reputación ni
  comparación con otros estudiantes. No se guardan en el cliente.

## Validación

- Reutiliza el endpoint integrado B165; no añade endpoints, permisos,
  persistencia, dependencias ni cambios de workflows.
- Las fechas se agrupan en UTC tal como devuelve el contrato. Un refresh puede
  reflejar cambios de visibilidad o moderación.
- La aceptación local y los commits atómicos se documentan en la PR.
