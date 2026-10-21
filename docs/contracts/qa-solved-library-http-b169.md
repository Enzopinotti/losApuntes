# B169 — Biblioteca de preguntas resueltas por materia

## Objetivo

Descubrir preguntas académicas cuya **respuesta aceptada** todavía está
disponible públicamente, como material complementario para estudiar una
materia. A diferencia de B166 (preguntas de compañeros que necesitan ayuda),
B169 permite navegar preguntas con una solución elegida por su autor. No
significa que la respuesta sea académicamente correcta ni que haya sido
verificada por docentes: **aceptada no equivale a certificada**.

## GET /qa/discovery/solved-questions?subjectId=<UUIDv4>&cursor=<opaque>

- Requiere `AuthSessionGuard` revocable; la identidad de sesión surge de
  `request.user.id`, sin aceptar otros IDs de usuario.
- `subjectId` obligatorio, `ParseUUIDPipe(version:'4')`, y resolución
  canónica usando `AcademicService.resolveResourceContext`, como la
  búsqueda Q&A existente.
- `cursor` opcional: se omite la primera vez y se utiliza el
  `nextCursor` retornado para obtener la página siguiente.
- Respuesta `Cache-Control: private, no-store`.
- 15 preguntas máximo por página, una fila extra solo para saber si
  existe próxima página. No hay límite ni offset arbitrarios.

Ejemplo ilustrativo de respuesta 200:

```json
{
  "items": [
    {
      "questionId": "269f2da7-f70c-418d-9151-000000000001",
      "subjectId": "bbde8519-5796-429c-b078-7b705edc5a0b",
      "title": "¿Cómo resolver este ejercicio de Análisis?",
      "createdAt": "2026-10-21T11:30:45.000Z",
      "acceptedAnswerId": "a7f8eab6-42c8-4539-9fcd-8ce5d8794581"
    }
  ],
  "nextCursor": null
}
```

La tarjeta provee IDs válidos para navegar hacia el detalle de pregunta
y la respuesta aceptada mediante los endpoints existentes de Q&A.
No devuelve cuerpos de pregunta/respuesta, datos de autor, moderación,
reportes, perfil, emails ni métricas de lectura.

## Semántica de "resuelta"

Una Question es elegible si:

1. Coincide con la materia canónica.
2. Tiene `moderationState=available` y `state=open|closed`.
3. Contiene `acceptedAnswerId` de tipo string.
4. Existe una Answer con `id=Question.acceptedAnswerId`,
   `questionId=Question.id` y `moderationState=available`.

**No alcanza** con que `acceptedAnswerId` esté poblado: el
`$lookup` valida ambas relaciones y visibilidad. Una respuesta aceptada
que haya sido ocultada ya no aparece como solución navegable.
Las preguntas no resueltas, ocultas o huérfanas tampoco aparecen.

Se consideran tanto preguntas abiertas como cerradas si mantienen una
respuesta aceptada disponible; `state=closed` por sí solo **no** es
criterio de solución.

## Orden, paginación y cambios concurrentes

Orden `Question.createdAt DESC, Question.id ASC`: las preguntas más
recientemente **creadas** aparecen primero, no las más recientemente
resueltas. No existe fecha de aceptación indexada para ordenar según
el momento en que una respuesta fue marcada como aceptada.

Cursor versión 1 base64url canónico, con fecha UTC ISO y UUIDv4 de
Question, materia canónica y huella SHA-256 truncada de la sesión.
El token vincula el recorrido a materia y cuenta; **no es una firma ni
un permiso**. Un cursor manipulado, no canónico, de otra cuenta o
de otra materia produce HTTP 422
`QA_SOLVED_LIBRARY_CURSOR_INVALID`.

El keyset avanza por `createdAt < last.createdAt`, o timestamp
igual con `id > last.questionId`. No existe snapshot transaccional:
moderación, cambio de aceptación y ediciones entre páginas pueden
alterar el resultado. El detalle debe revalidar la respuesta visible
al abrirla. Si el cursor falla, el cliente puede reiniciar desde la
primera página.

## Implementación y seguridad

Una agregación Mongo read-only comienza en `questions` por
materia/moderación/estado/aceptación; filtra el cursor antes de un sort
estable. Usa `$lookup` contra `answers` para confirmar la respuesta
aceptada, con `$limit:1`, sin materializar respuestas completas.
Descarta padres sin unión válida (`acceptedVisible.0` inexistente),
proyecta solo los cinco campos públicos y limita a 16 filas.
`maxTimeMS=5000`; la respuesta está acotada, aunque el trabajo de
Mongo puede crecer con el número de preguntas que deban filtrarse.

Las filas malformadas, IDs no UUIDv4, materias inesperadas,
timestamps inválidos, duplicados, orden incorrecto o más de 16
resultados provocan HTTP 503
`QA_SOLVED_LIBRARY_UNAVAILABLE`. Las excepciones del driver se
propagan; no se inventa una biblioteca vacía por un fallo de Mongo.

Se reutilizan los índices, esquemas y permisos existentes de Q&A.
No hay escrituras, alteraciones de autenticación, cambios en DB,
migraciones, Web/Mobile, lockfile ni dependencias.

## Pruebas y publicación

- Jest del servicio: filtro owner-safe, materia académica canónica,
  `$lookup` de respuesta aceptada visible vinculada al parent,
  descarte de aceptación oculta/no existente, orden, paginación 15+1,
  cursor scope, proyección y fallos de persistencia.
- Jest del cursor: versión, encodings, fechas UTC, UUID,
  cross-subject/cross-viewer, entrada corrupta.
- Jest del controlador: sesión, `subjectId` UUIDv4, cache no-store
  y autoridad exclusivamente de `request.user.id`.
- Ejecutar gates estrictos de TypeScript, ESLint, Prettier, related/full
  Jest, diez coberturas críticas y runtime smoke en SHA exacto.
- **La validación estructural mockeada del pipeline no es aceptación
  Mongo real del endpoint.** Es necesaria antes de promover el PR.
- Mientras la auditoría de producción mantenga riesgos high/critical
  (#133, #141 y #492), y el runner Mongo (#484) esté pendiente,
  el release #353 sigue HOLD. No fusionar/desplegar con bloqueos
  activos ni usar waivers.
