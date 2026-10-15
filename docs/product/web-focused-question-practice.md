# Práctica enfocada en una pregunta — continuidad Mesa de estudio

## Experiencia
En `/study?subjectId=<uuid-v4>`, la tarjeta de cada duda visible añade **Practicar esta pregunta**. Se navega a `/study/practice?subjectId=<uuid-v4>&questionId=<uuid-v4>`.

La pantalla no empieza la ronda automáticamente: primero comprueba contexto académico actual y sesión autenticada, recupera la pregunta por ID desde la API y exige coincidencia de **materia e ID**. Únicamente entonces muestra el título y enunciado y habilita **Empezar práctica enfocada**. Ninguna respuesta se presenta antes de que el estudiante haga su intento y pulse el botón de revelarlas en el flujo existente.

El estudiante puede abrir la conversación original o continuar usando la selección de hasta cinco preguntas del modo general. Las notas de intento, las marcas de repaso y los handoffs al Planificador conservan sus controles de sesión/alcance actuales.

## Invariantes
- `questionId` solo admite un UUID v4, una vez, canónico. Ausencia = recorrido general; duplicado/malformado = aviso y acción explícita para elegir preguntas sin foco. Un link inválido nunca abre silenciosamente otra ronda.
- El ID no concede acceso: `resolveStudySubject` exige materia dentro del contexto autoritativo y `communityApi.question` vuelve a comprobar disponibilidad. El título/enunciado solo se muestran si la respuesta de la API corresponde a ambos IDs.
- Ticket `AbortSignal` y `useAsyncAuthorityFence` evitan que respuestas de otra materia, cuenta o pestaña reemplacen la vista actual.
- La ronda queda aislada por sesión, materia y foco: navegar a otra pregunta no reutiliza una práctica en curso.
- No se añaden endpoints, datos persistidos, rankings, calificaciones oficiales ni acceso a respuestas privadas.

## Pruebas
`node scripts/test-web-focused-practice-contract.mjs` valida parser, duplicate rejection, roundtrip, rechazo de cross-subject y vinculaciones de seguridad. El script valida la lógica de enlaces y sus vínculos de seguridad. El workflow propuesto por el PR original **no fue incorporado en B58**; las comprobaciones Prettier/TypeScript quedan pendientes de ejecución en un checkout completo.

**Pendiente para aceptación general:** navegación desde Mesa de estudio, ronda real en un navegador, caducidad de sesión, cambio de materia en otra pestaña, pregunta borrada, links inválidos/repetidos, botón Volver, accesibilidad con teclado/lector de pantalla, mobile responsive y handoff a Planificador. No se realizará hasta la fase integral de pruebas acordada.
