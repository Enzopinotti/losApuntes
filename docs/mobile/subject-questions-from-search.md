# Del contexto de una materia a sus preguntas — Mobile

**Fecha:** 2026-10-12  
**Origen:** plan de valor académico rápido, etapa P2.  
**Requisitos existentes:** 00/valor antes del efecto red y primer valor académico; 01/`SEARCH-FR-004`, `QA-FR-001`, `ACAD-FR-006`, `MOB-FR-005/007`; 02/backend y Academic Context como autoridades; 03/validación exact-head y dispositivo.

## Brecha de producto confirmada

La pantalla **Buscar** ya presentaba resultados de materias y recursos agrupados por las materias actuales, con opción para abrir/guardar apuntes. La pantalla **Red** ya contenía preguntas, respuestas y paginación, con filtro basado en el contexto académico **actual** del usuario.

No existía una conexión directa para consultar las preguntas de una materia descubierta mediante Buscar cuando esa materia **no** era el contexto actual.

## Flujo nuevo

- Buscar → resultado de **Materia** → **Ver preguntas de esta materia**.
- Buscar → **Recursos de tus materias actuales** → **Ver preguntas de esta materia**.
- Ambos abren `/questions/subjects/[subjectId]`, una ruta con ID de materia **UUIDv4 validado**.
- La pantalla consulta al servidor mediante el cliente de Q&A y su `QuestionPageInput {subjectId, limit:25}`.
- Muestra preguntas disponibles, nombre de materia canónico que devuelve el servidor, cantidad de respuestas y acceso a `/questions/[questionId]`.
- Soporta primera carga, ausencia de preguntas, error, reintento y páginas sucesivas. Nunca se afirma que el listado de la primera página es completo si hay `nextCursor`.
- Si la materia consultada coincide con la participación académica actual **confirmada por el servidor**, se muestra «Hacer una pregunta» usando el compositor existente.
- Si la materia no es el contexto actual, el flujo es de **lectura solamente**. Se explica que para publicar primero hay que seleccionarla desde Inicio. No se asume que una URL otorga participación o derecho a publicar.

## Autoridad, privacidad e invariantes

- El parámetro de ruta es solo un **filtro**, no un permiso.
- El backend de Q&A conserva la validación de sesión, publicación y visibilidad. Mobile no incorpora un endpoint nuevo ni consulta datos no autorizados.
- Se reutiliza `useCommunityAuthority` para foco de pantalla, revalidación de sesión/contexto, segundo plano y restricciones. El controlador `MobileCommunityFeedController` tiene cancelación/generation fencing y pagination con el mismo `subjectId`.
- La operación se identifica por `authorityKey + subjectId`. Cambiar de cuenta/contexto o navegar a otra materia limpia el snapshot y descarta resultados atrasados.
- No se crea una asociación `SubjectParticipation`, ni se altera el contexto académico a partir del enlace.
- No se guarda información privada en AsyncStorage ni se generan URLs de recursos/archivos.

## Aceptación manual pendiente

1. Buscar «Cálculo» y pulsar «Ver preguntas de esta materia»: la API Q&A recibe el `subjectId` de Cálculo, no el de la materia actual.
2. Abrir una pregunta devuelta y comprobar su detalle/respuestas existentes; la navegación «Volver» regresa al recorrido previo.
3. Un alumno sin esa materia como participación actual **puede leer** lo autorizado, pero **no** ve una opción de composición asociada a ella.
4. Un alumno con esa materia confirmada como contexto actual sí puede abrir el compositor ya existente.
5. Modificar directamente el deep link a un UUID no existente: el servidor debe devolver vacío/error, nunca inventar una materia.
6. Usar un ID mal formado: no se llama a la API, se muestra error de enlace.
7. Cargar más de 25 preguntas; comprobar que el cursor mantiene el filtro sin repetir preguntas.
8. Cambiar de cuenta durante carga: no renderizar preguntas de la cuenta anterior.
9. Pasar Mobile a segundo plano y regresar: revalidación y ausencia de respuestas tardías.
10. Simular red caída y falta de privilegios: copy de error y reintento seguro.
11. Verificar controles de al menos 44 puntos y lectura con TalkBack/VoiceOver.
12. Verificar API/contract, `tsc`, suites Mobile/API, build Expo y ejecución real Android/iOS sobre el SHA candidato antes de certificar.

## Estado técnico

Implementación integrada mediante PR con commits atómicos `[skip ci]` por la instrucción temporal del usuario. **No equivale a validación**: las pruebas nuevas se escribieron pero no se ejecutaron, y no hay evidencia de compilación o dispositivo para este bloque. No se abren nuevos proveedores ni modelos persistentes.
