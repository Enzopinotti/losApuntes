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

## Contrato de aceptación y release

- Jest: 28 fechas ordenadas y con ceros, límite UTC en medianoche,
  reglas de moderación del parent en `$lookup`, owner scoping,
  integridad de suma, duplicados/fechas incorrectas, errores de Mongo
  y autenticación/caché.
- Validar exact-head con Jest, TypeScript, Prettier, API ESLint
  estricto, 10 coberturas críticas y smoke de runtime.
- Las pruebas unitarias verifican estructura Mongo; **no sustituyen
  una prueba de aceptación específica contra Mongo real**.
- Auditoría productiva high/critical obligatoria. Mantener issues
  #133, #141 y #492 y release #353 HOLD; **no fusionar/desplegar**
  con advisory high pendiente ni aprobar excepciones.
