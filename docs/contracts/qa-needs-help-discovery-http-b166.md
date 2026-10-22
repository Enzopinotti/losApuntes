# B166 — Preguntas que necesitan ayuda: descubrimiento Q&A por materia

## Objetivo

Permitir que un estudiante **ayude a otros estudiantes** localizando preguntas
abiertas de una materia que todavía no recibieron ninguna **respuesta visible**.
A diferencia de la búsqueda general `GET /questions`, el resultado prioriza
consultas que siguen sin aportes públicos. Complementa el historial propio
B145/B146 y el seguimiento B161, sin introducir escritura, ranking de personas,
notificaciones, reputación, lectura de contenido oculto ni acciones automáticas.

## GET /qa/discovery/needs-help?subjectId=<UUIDv4>&cursor=<opaque>

- Requiere `AuthSessionGuard` de una sesión revocable. La identidad del
  usuario proviene **únicamente** de `request.user.id`.
- `subjectId` es obligatorio: UUIDv4 validado por `ParseUUIDPipe`.
  El backend lo resuelve con `AcademicService.resolveResourceContext`,
  igual que la búsqueda Q&A existente (admite IDs canónicos resueltos).
- `cursor` es opcional para la primera página; páginas posteriores pasan
  el `nextCursor` recibido sin modificarlo.
- `Cache-Control: private, no-store` en respuestas exitosas.
- Límite fijo: 15 tarjetas por página y una fila adicional para detectar
  si hay página siguiente. No se acepta `limit` arbitrario.

Ejemplo de respuesta HTTP 200:

```json
{
  "items": [
    {
      "questionId": "269f2da7-f70c-418d-9151-000000000001",
      "subjectId": "bbde8519-5796-429c-b078-7b705edc5a0b",
      "title": "¿Cómo resuelvo este ejercicio de Cálculo?",
      "createdAt": "2026-10-19T14:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

Si no hay preguntas que necesiten ayuda:
`{"items":[],"nextCursor":null}`.

## Semántica exacta

Solo pueden aparecer `Question` que:

1. Tienen el `subjectId` canónico solicitado.
2. Siguen `state=open` y `moderationState=available`.
3. **No pertenecen al usuario consultante**: se excluye
   `authorUserId=request.user.id`.
4. No poseen **ninguna** `Answer` `moderationState=available`.
   Respuestas ocultas por moderación no impiden que una pregunta
   aparezca en la bandeja. Se consulta `answers` por `questionId`
   con un `$lookup` de existencia y `$limit:1`.

La fuente de verdad **no es** `Question.answerCount`, porque podría incluir
respuestas que ya fueron ocultadas. La tarjeta **no** devuelve nombre,
ID ni perfil del autor, cuerpo de la pregunta, respuestas, reportes,
datos académicos privados ni estado interno de moderación. Para leer
la pregunta o responder, el cliente abre la ruta autorizada existente
`GET /questions/:id` y después, si corresponde, `POST /questions/:id/answers`.
El usuario puede haber recibido respuestas entre listar y abrir el detalle;
la navegación vuelve a validar el estado vigente.

Orden determinista: `createdAt ASC, id ASC` (primero las preguntas que
más tiempo esperan respuesta disponible; no un indicador de urgencia real).
Cursor keyset estricto: `createdAt >` última fecha o misma fecha e
`id >` último ID. La consulta no promete snapshot: moderación,
respuestas nuevas y preguntas cerradas pueden alterar páginas futuras.

## Cursor y límites de confianza

Cursor canónico base64url JSON de versión 1 con fecha ISO UTC canónica,
UUIDv4 de pregunta, ID de materia y huella SHA-256 truncada del usuario.
Se valida estructura exacta, tamaño de token y decodificación canónica.
Reutilización entre materias o entre sesiones de **cuentas distintas**
produce HTTP 422 `QA_NEEDS_HELP_CURSOR_INVALID`. El fingerprint no es
una firma criptográfica y **no concede permisos**. La seguridad reside
en el guard y en los filtros servidor de cada request. Los cursores
pueden reiniciarse desde el inicio cuando pierden vigencia.

## Mongo y rendimiento

Se inicia una única consulta de solo lectura por `questions`, con
`$match` por materia/estado/moderación, exclusión del usuario
y filtro de cursor, **antes** de la unión. Sigue `$sort` ascendente
y `$lookup` acotado a máximo un `Answer` disponible. Se eliminan
padres con respuesta visible (existencia de `visibleAnswers.0`),
se proyectan solo cuatro campos y se limitan a **16** filas.

`maxTimeMS=5000` protege el servidor frente a consultas lentas;
el costo de procesar preguntas anteriores a encontrar 16 elegibles
no es constante. Reutiliza índices y esquemas existentes, sin
cambios en `main` de Q&A core, autenticación, migraciones ni lockfile.

Filas agregadas con UUIDs, títulos, fechas o materias incorrectas;
duplicados; filas fuera de orden y más de 16 resultados generan
503 `QA_NEEDS_HELP_UNAVAILABLE`. Fallos de Mongo/servicio académico
**no** se convierten en páginas vacías ficticias.

## Validación del carrier y aceptación pendiente

- El carrier conserva los 17 commits atómicos originales de B166 sobre
  `main@3e023e5f` y agrega un commit separado de evidencia; no se hace
  squash.
- Jest cubre guard/ParseUUIDPipe/no-store, aislamiento de cuenta,
  materia académica, moderación, unión `Answer.questionId = $$parentId`,
  cursor y orden oldest-first, paginación 15+1, datos corruptos y errores.
- Validación local del carrier: 3 suites / 29 pruebas, API TypeScript,
  ESLint sin warnings, Prettier API, `nest build`, Prettier del contrato
  y `git diff --check` — PASS.
- No se ejecutó CI. Los tests usan mocks; **no se verificó el agregado
  contra Mongo real**. Este entorno no tiene daemon Docker ni `mongod`;
  ejecutar aceptación con una réplica aislada antes de producción.
- El endpoint es read-only y no agrega cambios a Web/Mobile, Q&A core,
  autenticación, schemas, índices, migraciones, dependencias ni workflows.
  La integración del código no acredita runtime ni habilita un despliegue.
