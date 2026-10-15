# B59 — Ejecutar sesiones de estudio desde el Planificador

Estado: integrado en una rama funcional para revisión. **No se declara E2E, build ni CI aprobados**. No se cambia configuración productiva.

## Valor para el estudiante

El flujo previo permitía preparar una sesión y exportarla, pero no existía una experiencia dedicada para recorrerla. Este bloque agrega `/study/run?subjectId=<UUIDv4>`:

1. Planificar hasta 24 actividades (apuntes o preguntas) en `/study/session`.
2. Elegir **Realizar esta sesión**. El borrador validado pasa por memoria de la pestaña, asociado a estado de autenticación, usuario, sesión y materia.
3. Revalidar contra el servidor cada referencia del plan antes de mostrar un título; no se confía en identificadores importados.
4. Recorrer las actividades, abrir el material en otra pestaña y usar un temporizador **opcional** por actividad.
5. Pausar y reanudar cada tiempo. Cambiar de actividad o esconder la pestaña pausa el reloj; regresar conserva el tiempo restante mientras la pantalla viva.
6. Marcar una actividad como realizada o volver a pendiente, siempre con una consulta fresca de permisos justo antes de aplicar la marca.
7. Exportar un JSON de Study Session v1, conservando los `done` y la planificación, para continuar desde el Planificador o desde otro dispositivo.
8. Si no hay borrador, importar manualmente un archivo JSON de sesión ya exportado.

## Autoridad y tratamiento de fallos

- Se requiere `PrivateRoute`, sesión autenticada y materia seleccionada explícitamente entre las materias vigentes retornadas por `GET /discovery/contextual` (ventana de 8, misma limitación que el planificador).
- Un archivo externo debe respetar **exactamente** el esquema v1 y máximo de 64 KB, con materia idéntica. Su ID no autoriza la lectura.
- Cada recurso se comprueba mediante `GET /resources/:id` y cada pregunta mediante `GET /questions/:id`, verificando `academic.subject.id` con la materia autorizada.
- 403/404 generan una actividad «sin acceso»; otras fallas de red/API no se convierten en ausencia y no reemplazan el plan disponible.
- Las consultas con respuestas tardías se invalidan por `useAsyncAuthorityFence`; los estados se segmentan por estado/auth/usuario/sesión/materia.
- No se descargan ni almacenan bytes de Files, respuestas de preguntas ni títulos para el JSON; sólo campos del esquema v1.
- No se utiliza localStorage, sessionStorage, IndexedDB ni base de datos nueva. El plan activo no sobrevive recarga; exportar JSON es una acción del estudiante.
- Marcar «realizada» es autodeclaración, no verificación de comprensión, examen, asistencia ni medición automática. El fin del temporizador **no** marca la tarea.
- La operación de comprobación y la de marcado no constituyen transacción con la revocación posterior de permisos; si se revoca después de la comprobación, el JSON sigue siendo una declaración del estudiante y no concede acceso.

## Controles propuestos

`node scripts/test-web-study-session-runner.mjs` cubre reloj de pared, pausa/reanudación, fin de tiempo, entradas inválidas, conservación del formato, aislamiento, revalidación previa a la marca, acceso privado y compatibilidad con el Planificador.

Pendiente para liberar: `pnpm --filter @losapuntes/web check:types`, formateo/lint, prueba de navegador con cambio de sesión, revocaciones de acceso, visibilidad y validación real con API. El trabajo no inicia Web, MongoDB ni servidores de API.

## Coordinación

- Alcance: modelo de estudio nuevo, una nueva página Web, ruta privada, botón de acceso del Planificador, estilos, tests y este documento.
- No modifica colecciones persistentes, auth, API, MongoDB, exportación de cuenta ni dependencias.
- El PR draft #344 toca `StudySession.tsx` sólo por formato en su rama y **debe reconciliarse explícitamente** después de incorporar este bloque; no sobrescribir el nuevo botón.
- PR #333 contiene una corrección de tipado histórica sobre el Planificador y también necesita validar su base frente a main.
- Issues #133 y #141 de seguridad de dependencias permanecen bloqueos separados de aceptación productiva. No se agregan excepciones.
