# B138 — Navegación guiada por preguntas sin clasificar y pendientes de repaso

**Base:** `main@3aa419f8c5e43beb4564300be39e3ba968787be5` (B136/B137 integrados).
**Release:** #353 **HOLD**, `STUDY_PROGRESS_ENABLED=false`.

## Problema de producto

En una ronda de práctica hay hasta diez preguntas y el estudiante puede saltearlas o marcar "Necesito repasar". Antes de B138, debía recorrer secuencialmente la lista o localizar las preguntas una por una, lo que hacía difícil retomar una práctica interrumpida o cerrar todas las preguntas sin clasificar.

## Comportamiento nuevo

Dentro de "Tu propio repaso" aparecen dos controles de navegación manual:

- **Siguiente sin clasificar**: va a otra pregunta que todavía no tiene marca explícita.
- **Siguiente para repasar**: va a otra pregunta clasificada "Necesito repasar".

Ambos recorren la lista en el orden original, empezando **después** de la pregunta actual y dando como máximo una vuelta. Si no existe **otra** pregunta correspondiente, se deshabilita el botón. Las preguntas marcadas "Lo pude explicar" quedan fuera de ambos saltos; una pregunta sin marca nunca se interpreta como una respuesta incorrecta o como aprendizaje insuficiente.

Estos botones **solo cambian la posición de visualización** de la ronda actual. No borran el texto escrito, no cambian los marks, no recalculan el historial y no inician automáticamente otro intento. El estudiante siempre puede escoger cualquier posición con la lista actual.

## Integridad y seguridad

- El modelo puro `nextRecallFocus` se basa en `normalizeRecallQueue` y `retryRecallQueue`: validación UUID v4, normalización de identidad, rechazo de marcas para preguntas ajenas, outcomes arbitrarios, arrays malformados, índices inválidos o categorías no soportadas.
- Los saltos protegen el `scope` de cuenta/materia y comprueban que la ronda y el cursor usados siguen siendo los vigentes antes de actualizar el estado React.
- Cuando se selecciona otro UUID, el `detailKey` existente y `useAsyncAuthorityFence` ejecutan una consulta autorizada de `communityApi.question` y comprueban la materia. La navegación por IDs no concede acceso ni reutiliza contenido de otras materias.
- B134–B137 siguen intactos: reintentos, agenda, pausa/reanudación, resumen Markdown y exportación de planes.
- Sin endpoints nuevos, storage, scores, permisos, dependencias ni cambios de flags.

## QA

```bash
pnpm test:web-study-recall-focus
pnpm test:web-study-private-report
pnpm test:web-study-recall-pause
pnpm test:web-study-recall-planning
pnpm test:web-study-retry-round
node scripts/test-web-study-practice-integration.mjs
pnpm --filter @losapuntes/web check:types
pnpm --filter @losapuntes/web lint
pnpm --filter @losapuntes/web format:check
```

El nuevo contrato se incorpora a `pnpm test` y se ejecuta en CI Node24 sobre el SHA exacto sin modificar el árbol de trabajo. La batería global de Quality Gate, 10 coberturas críticas, runtime smoke y audit productivo permanece independiente.

**Restricciones de release:** issues #133, #141 sin corrección en upstream; #353 HOLD. No se habilita Study Progress ni se despliega producción por un merge funcional.
