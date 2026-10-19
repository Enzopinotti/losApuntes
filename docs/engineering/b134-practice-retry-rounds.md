# B134 — Reintentar preguntas marcadas para repasar (Study Practice)

**Base de integración:** `main@f120974fafe2340aca9d4b76e2250a9a9f2049b1` (B133).
**Release:** #353 **HOLD**; `STUDY_PROGRESS_ENABLED=false`.

## Problema y nueva funcionalidad

La práctica de preguntas permitía seleccionar hasta diez preguntas, escribir una respuesta privada y temporal, comparar con aportes de la comunidad, autoclasificar "Necesito repasar" / "Lo pude explicar" y exportar un plan. Al terminar, **no permitía otra ronda directa solo con las preguntas pendientes**: requería salir o importar un plan.

B134 agrega **Reintentar N para repasar** dentro de la misma práctica:

1. El estudiante responde y revela las respuestas mediante una consulta nueva al servidor, como antes.
2. Al marcar algunas preguntas con "Necesito repasar", la nueva acción se habilita (sin inferir aprendizaje de una nota o temporizador).
3. Se pide confirmación explícita de la pérdida de notas y marcas de esta ronda.
4. La siguiente ronda conserva **solo los UUID de las preguntas explícitamente marcadas para repasar**, en el orden original. Se reinicia el progreso, las marcas, las respuestas reveladas y los intentos escritos.
5. El contador **Intento N** y un `detailKey` por intento obligan a cargar de nuevo el material; incluso si el primer ID es el mismo, no se reutiliza la pregunta ni la respuesta mostradas antes.
6. Si en otro intento se marcan nuevas dudas, puede reintentarse nuevamente sin salir. No se guardan calificaciones automáticas ni estadísticas públicas.

## Contrato de privacidad y autorización

- Las preguntas siguen limitadas a la materia actual y al scope de identidad/sesión; cada consulta `communityApi.question` verifica `academic.subject.id`.
- El inicio de un nuevo intento **no** habilita ni revela contenido por sí mismo. `useAsyncAuthorityFence` invalida los requests anteriores al cambiar `detailKey`, también en una repetición del mismo ID.
- `retryRecallQueue` es estricto: rechaza ID inválido/duplicado, outcomes ajenos, estados no permitidos y objetos de forma no confiable. Preguntas sin marca o explicadas no entran automáticamente.
- Todo permanece en memoria de la pestaña, sin tokens, grants, títulos de terceros, notas en storage o backend; el reinicio es manual con confirmación.
- Si una pregunta fue eliminada, dejó de ser visible o cambió de materia, la consulta nueva muestra el error de autorización/disponibilidad existente; no se reutiliza el cache de respuestas.
- La exportación JSON y el pase al Planificador existentes se mantienen; no cambian los permisos ni el formato del plan de sesión v1.

## Pruebas y aceptación

```sh
pnpm test:web-study-retry-round
node scripts/test-web-study-active-recall.mjs
node scripts/test-web-study-practice-integration.mjs
node scripts/test-web-focused-practice-contract.mjs
pnpm --filter @losapuntes/web check:types
pnpm --filter @losapuntes/web lint
pnpm --filter @losapuntes/web format:check
```

La prueba B134 se incorpora también al `pnpm test` obligatorio. El workflow del bloque ejecuta los contratos anteriores sobre el **SHA exacto** del PR. Un runtime smoke de API genérico no sustituye la aceptación de interfaz navegador con dos cuentas y revocación de permisos. Esos escenarios permanecen pendientes para release.

No se tocan dependencias, exportación de cuenta, flags, base de datos, API ni el release gate. La auditoría de seguridad de #133 y #141 sigue obligatoria y roja hasta su remediación real.
