# B203 — Bandeja móvil de respuestas recibidas

## Problema y comportamiento

Mobile no ofrecía una bandeja con respuestas visibles que llegaron a las
preguntas de la cuenta. B203 consume `GET /qa/me/received-replies` y agrega una
entrada desde Red. La bandeja presenta el título de la pregunta, la fecha de la
respuesta y si fue aceptada; abrir una fila navega al detalle canónico, que
vuelve a validar el acceso.

La identidad del dueño siempre surge de la sesión autenticada. El cliente no
acepta IDs de cuenta y descarta respuestas con forma inválida, orden incorrecto,
duplicados dentro de la página o cursores malformados. La paginación es por
cursor, sin offsets, y se cancela o cerca al cambiar de sesión, perder foco o
pasar a segundo plano.

## Privacidad y límites

- Sólo muestra datos de navegación y metadatos que el endpoint publica para el
  dueño de las preguntas.
- No muestra texto de respuestas ni identidad de quien respondió.
- No afirma que una respuesta aceptada esté verificada académicamente.
- No genera notificaciones ni infiere lecturas.
- No añade endpoints, almacenamiento, dependencias, permisos ni cambios de
  workflows.

## Validación local

- Pruebas de contrato del cliente: forma de respuesta, orden, cursor, límites,
  proyección y sesión autorizada.
- Pruebas del controlador: paginación, autoridad de cuenta, cancelación,
  cursores repetidos y recuperación de cursor vencido.
- Prueba de navegación y exposición de datos de presentación.
