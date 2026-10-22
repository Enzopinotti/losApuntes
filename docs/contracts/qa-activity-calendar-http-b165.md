# B165 — Calendario privado de participación académica Q&A (v1)

## Propósito

Una representación compacta, privada y no competitiva de los días en que el
estudiante hizo preguntas o publicó respuestas en Q&A. Facilita un calendario
de actividad en Perfil/Inicio sin descargar historiales completos.

**No** representa asistencia a clases, respuestas correctas, rachas
certificadas, notas, resultados de aprendizaje, tiempos de estudio ni
comparaciones con otros estudiantes. Complementa B159 (conteo global),
B160 (desglose por materia) y B162 (conversaciones).

## GET /qa/me/activity-calendar

- Requiere `AuthSessionGuard` revocable existente.
- El backend usa exclusivamente `request.user.id`. No acepta fechas
  elegidas por el cliente, otros IDs ni timezone en v1.
- `Cache-Control: private, no-store`.
- Respuesta 200, ejemplo reducido **ilustrativo**; en producción se
  entregan exactamente **28** elementos en `days`:

```json
{
  "asOfUtc": "2026-10-20T23:40:01.000Z",
  "windowStartUtc": "2026-09-23T00:00:00.000Z",
  "windowEndUtcExclusive": "2026-10-21T00:00:00.000Z",
  "days": [
    {
      "dateUtc": "2026-09-23",
      "questions": 0,
      "answers": 0,
      "total": 0
    }
  ]
}
```

En una respuesta real, cada fecha UTC desde `windowStartUtc`
inclusive hasta `windowEndUtcExclusive` exclusive aparece una vez.
`asOfUtc` es el instante de referencia tomado una sola vez al
iniciar el request. La ventana incluye hoy UTC y los 27 días previos;
no es un período móvil de 672 horas a partir de la hora actual.

## Definiciones de visibilidad

- `questions`: preguntas creadas en ese día UTC por el usuario actual,
  con `moderationState=available` y `state=open|closed`.
- `answers`: respuestas creadas en ese día UTC por el usuario actual,
  que sean `moderationState=available` **y cuya Question de origen
  permanezca available/open|closed**. Un parent oculto elimina el aporte
  de la vista, aunque la respuesta pertenezca al usuario.
- `total=questions+answers` (no equivale a un puntaje, calificación
  o nivel de conocimiento). Se omite el contenido textual, autores
  externos, IDs internos, carreras, materias e información personal.
- Fechas sin actividad visible tienen conteos cero, nunca desaparecen.
- Modificaciones o moderación pueden cambiar los conteos al refrescar.
  El endpoint no garantiza snapshot transaccional entre Questions y
  Answers. Una respuesta editada se cuenta por `createdAt`, no por
  `updatedAt`.

## Persistencia, seguridad y costo

Dos agregaciones independientes y simultáneas en Mongo:

1. `questions`: `$match` owner-first por
   `authorUserId`, estado, moderación y `createdAt` en ventana;
   agrupar por `$dateToString` UTC; proyectar únicamente día y count.
2. `answers`: igual filtro owner-first y fecha, seguido de
   `$lookup` por `Question.id` con `$$questionId`, filtro de
   moderación, `$limit:1` y `$unwind` para descartar padres
   ocultos/ausentes. Luego agrupar por día UTC.

Cada consulta usa `maxTimeMS=5000` y `$limit:29` **después del group**.
El payload al API tiene como máximo 28 buckets válidos por colección;
no se transfieren documentos crudos. El costo de procesamiento en
Mongo aún crece con el historial del usuario dentro de la ventana,
y el límite temporal **no garantiza CPU constante**.

Rows de fechas fuera de rango, duplicados, conteos fraccionales,
negativos o inseguros, filas de más de 28 días y overflow en sumas
son un error de integridad: HTTP 503 con
`QA_ACTIVITY_CALENDAR_UNAVAILABLE`. Una caída de Mongo se propaga
por el manejo de errores global; nunca se presenta como días vacíos.

No incorpora colección, índice, migración, escritura, privilegio,
campo de perfil, código Web/Mobile ni cambio al core de Q&A.

## Validación del carrier y aceptación pendiente

- El carrier conserva los 11 commits atómicos originales de B165 sobre
  `main@f6f9ce24` y agrega un commit separado de evidencia; no se hace
  squash.
- Jest cubre 28 días ordenados con ceros, límites UTC, moderación del
  parent en `$lookup`, owner scoping, sumas, duplicados, filas inválidas,
  errores Mongo y autenticación/caché.
- Validación local del carrier: 2 suites / 16 pruebas, API TypeScript,
  ESLint sin warnings, Prettier API, `nest build`, Prettier del contrato
  y `git diff --check` — PASS.
- No se ejecutó CI. Los tests usan mocks; **no se validó el agregado
  contra Mongo real**. Este entorno no tiene daemon Docker ni `mongod`;
  ejecutar aceptación con una réplica aislada antes de producción.
- La ruta es de solo lectura y no crea una categoría de datos ni modifica
  Web/Mobile, autenticación, schemas, índices, migraciones, dependencias
  o workflows. La integración del código no acredita runtime ni habilita
  un despliegue.
