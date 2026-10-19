# B140 Web — Personalización del orden y prioridades de repaso

**Integración base verificada:** `main@485b2528df8c5df1c2d58bc7e09a5dece5d4abf6` (B139).
**Carril:** Web / Study Practice. Este B140 **no** es el B140 de infraestructura Mongo que otro agente tiene en PR #464. No tocar ese PR ni archivos de infraestructura.
**Release:** #353 **HOLD** y `STUDY_PROGRESS_ENABLED=false`; auditoría productiva #133/#141 todavía bloqueada.

## Nueva funcionalidad

La ronda de **Practicar preguntas** ahora permite personalizar su orden sin abandonar la práctica:

- **Repasar primero:** agrupación estable de preguntas marcadas `review`, seguidas por preguntas sin clasificar y por preguntas que el estudiante marcó `understood`.
- **Sin clasificar primero:** agrupación estable de preguntas sin marca, seguidas por las marcadas `review` y luego las `understood`.
- **Subir esta pregunta** y **Bajar esta pregunta:** movimiento manual adyacente de la pregunta actualmente seleccionada, para elegir exactamente qué estudiar antes.
- Los botones se deshabilitan cuando no producirían un cambio. Un set de una sola pregunta no permite movimientos ficticios.

La clasificación depende **únicamente de las dos marcas manuales existentes** y de que falte una marca; no es una predicción, dificultad algorítmica, puntuación de conocimiento, calificación ni ranking social. Se conserva el orden relativo dentro de cada categoría.

## Integridad de la ronda

`organizeRecallQueue(subjectId, ids, position, outcomes, action)` es puro, acotado y falla de manera cerrada. Reutiliza `normalizeRecallQueue` y `retryRecallQueue` para validar UUID v4, unicidad, que cada marca corresponda a la cola y que solo existan resultados `understood` o `review`.

- Reordenar **no altera** `outcomes`, `reflections`, `revealedIds`, `pass`, `history`, fecha, minutos ni preguntas seleccionadas. Cambia solamente `ids` y `position`.
- La pregunta activa se mantiene por **ID**, no por índice. Por eso moverla no muestra el cuerpo o las respuestas de otra pregunta por accidente.
- Antes de aplicar un resultado de React se vuelve a comparar el `scope` y que la ronda actual aún corresponda al mismo intento, orden y pregunta. Los clics tardíos de otro contexto no sobreescriben una cola modificada.
- El `detailKey` y `useAsyncAuthorityFence` existentes continúan aplicándose cuando la pregunta realmente cambia; ninguna lista de UUIDs otorga permiso de lectura.
- La pausa B136 guarda y retoma el nuevo orden y la posición. B138 usa inmediatamente ese orden para navegar por pendientes, y B139 importa una cola inicial sin restricciones adicionales.
- La exportación a Planificador/JSON B135 respeta el nuevo orden para las preguntas marcadas `review`, con la revalidación de autoridad existente. Las fichas personales B137 no incluyen preguntas ni sus IDs.

No hay datos nuevos en servidor ni almacenamiento de dispositivo; se mantiene la privacidad de la práctica por pestaña.

## Validación

```sh
pnpm test:web-study-recall-order
pnpm test:web-study-review-plan-import
pnpm test:web-study-recall-focus
pnpm test:web-study-recall-pause
pnpm test:web-study-retry-round
pnpm --filter @losapuntes/web check:types
pnpm --filter @losapuntes/web lint
pnpm --filter @losapuntes/web format:check
```

El contrato B140 forma parte de `pnpm test` obligatorio; un workflow exact-HEAD read-only repite modelos, regresiones y checks de Web. Antes de merge exigir `Quality Gate`, 10 coberturas críticas y smoke de contenedores en el SHA final. La auditoría productiva continúa **FAIL** mientras las dependencias altas conocidas no estén corregidas y `#353` se mantiene en HOLD.

## Fuera de alcance

No persistir preferencias entre pestañas; no implementar recomendaciones por IA, gamificación de notas, algoritmo de repetición espaciada ni reordenar automáticamente una respuesta escrita. Un cambio de cuenta, materia o sesión sigue aislando la ronda.
