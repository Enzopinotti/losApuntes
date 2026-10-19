# B136 — Pausar y retomar rondas de práctica de forma privada

**Base:** `main@bef96f938bf3b99a1126373a71730bfb8bf1d68d` (B135).
**Estado de release:** #353 **HOLD**; `STUDY_PROGRESS_ENABLED=false`. Las vulnerabilidades #133 / #141 siguen pendientes.

## Nueva funcionalidad

La pantalla `/study/practice` permite **Pausar ronda** con confirmación explícita. El estudiante puede navegar a la Mesa de Estudio y regresar dentro de diez minutos a la **misma pestaña de SPA**, misma cuenta, sesión, materia y selección enfocada, para **Continuar ronda pausada**. También puede **Descartar pausa**.

Se conserva estrictamente en memoria volátil de módulo:

- UUIDs de hasta diez preguntas (en orden), posición actual e índice de intento.
- Marcas explícitas «Necesito repasar / Lo pude explicar» que estén dentro de esa lista.
- Recuentos agregados y acotados de intentos anteriores, hasta ocho.
- Fecha/hora opcional y minutos por pregunta elegidos para el plan de B135.

**No se guarda** el texto de respuestas escritas, el contenido de las preguntas ni las respuestas comunitarias, títulos, nombres de autores, permisos, URLs firmadas, tokens, ni las marcas de respuesta revelada.

## Límites técnicos y protección

- Las pausas no se escriben en `localStorage`, `sessionStorage`, `IndexedDB`, backend, URL ni React Router state. Por eso **no sobreviven a recargar la página, cerrar la pestaña o reiniciar la app**; no se promete sincronización entre dispositivos.
- TTL **10 minutos**, como máximo **cinco scopes** en memoria, límite de texto **8192 caracteres**.
- El acceso exige correspondencia del `scope` autenticado completo (identidad, ID de sesión, materia y foco) y del `subjectId`; otra cuenta, sesión, materia o pregunta enfocada no pueden inspeccionar, consumir o borrar la pausa.
- Un checkpoint tiene un formato exhaustivo y cerrado: no se permiten campos adicionales, IDs inválidos/repetidos, outcomes para preguntas ajenas, duración ajena a B135, historia desordenada ni fecha con formato inválido. Las pausas inválidas no se escriben; entradas corruptas se descartan al leerlas.
- Reanudar **consume una sola vez** la pausa. La nueva activación de la ronda cambia `detailKey` incluso si el intento y la pregunta conservan el mismo ID. `useAsyncAuthorityFence` invalida resultados anteriores, y se vuelve a consultar `communityApi.question` con su comprobación de materia; las respuestas arrancan ocultas.
- Volver a iniciar una ronda nueva elimina la pausa anterior del mismo scope. El descarte es explícito y confirmado. En la pausa se advierte de que las reflexiones privadas se perderán.

## Tests

```bash
pnpm test:web-study-recall-pause
pnpm test:web-study-recall-planning
pnpm test:web-study-retry-round
node scripts/test-web-study-practice-integration.mjs
node scripts/test-web-focused-practice-contract.mjs
pnpm --filter @losapuntes/web check:types
pnpm --filter @losapuntes/web lint
pnpm --filter @losapuntes/web format:check
```

Se incorpora el test B136 a `pnpm test` y al workflow específico exact-head read-only. Se verifican: clonación sin alias, expiración exacta, aislamiento por cuenta/sesión/materia/foco, consumo único, rechazo de datos privados y otros campos, bounded scopes, reinstanciación sin respuestas reveladas y actualización de la autoridad asíncrona. Sigue faltando validación interactiva en navegador de cambios de cuenta y navegación durante requests lentos para afirmar el GO de release.

No se tocan paquetes/lockfile, excepciones, CI audit obligatorio, API/DB, exportación de cuentas o flags de producto. El estado de liberación #353 no cambia.
