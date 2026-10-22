# B182 — Atajos opcionales durante la práctica académica

**Fecha:** 22 de octubre de 2026. **Base del carrier actual:** `main@2287659b37f89bf8aba177240fb827f8cd7704d0`. **Alcance:** Web, ronda de preguntas en `/study/practice`.

El PR #517 se creó sobre una base anterior e incluía un workflow dedicado. Este carrier fue reconstruido sobre `main` actual, conservando sus commits funcionales, de pruebas y documentación y excluyendo el commit de workflow. No se modifica ningún archivo de workflow ni protección.

## Problema
La práctica de recuperación activa ya permitía ir a la pregunta anterior o siguiente y revelar respuestas. Estas acciones requerían desplazarse hasta sus botones, incluso para quienes estudian con teclado. Los campos de reflexión son privados, por lo que atajos globales sin consentimiento podrían interceptar lo escrito o revelar respuestas prematuramente.

## Funcionalidad
En una **ronda de práctica autenticada y activa**, aparece una sección «Atajos opcionales de teclado» desactivada por defecto. El usuario puede habilitarla y deshabilitarla mediante un botón nativo con `aria-pressed`. Solo al activarla quedan disponibles:

- **Mayús + J:** pregunta anterior, si hay una anterior.
- **Mayús + K:** pregunta siguiente, si hay una siguiente.
- **Mayús + R:** revelar las respuestas actuales, solo cuando la pregunta está cargada y no hay un intento de revelación en curso.

Los atajos nunca califican automáticamente una pregunta. Marcar «Necesito repasar» o «Lo pude explicar» requiere los botones originales. Se preserva la petición existente para refrescar respuestas y su control de autoridad; los atajos no crean endpoints adicionales.

## Prevenciones explícitas
- Ignora por completo eventos con Control, Alt, Meta, repetición, composición IME, `defaultPrevented` o tecla sin combinación Mayús.
- Ignora el teclado al escribir en `input`, `textarea`, `select`, `contenteditable`, `role=textbox` o `role=combobox`, incluso si el objetivo está dentro de un elemento editable.
- `preventDefault` ocurre **únicamente si la acción está habilitada**; no consume ni rompe teclas ajenas.
- Se registran listeners sobre `window` solo cuando el usuario activó los atajos. El desmontaje y la desactivación liberan esos listeners.
- El componente se monta solo dentro del estado de ronda, con `key={scope}`, donde `scope` incluye usuario/sesión, materia y pregunta enfocada. No se restaura una preferencia de otra cuenta o ronda.
- No se guardan respuestas, preferencias, minutos, eventos ni métricas en storage o backend. No hay navegación fuera del dominio.
- Accesibilidad: estado presionado, lista visible solo al activar, botones de al menos 44 px, foco visible heredado de la página y disposición móvil.

## Pruebas y aceptación
`scripts/test-web-study-practice-shortcuts-b182.test.mjs` ejecuta 10 comprobaciones deterministas de mapa de teclas, teclas ignoradas, combos de sistema, IME y repeticiones, editores, falta de permisos, estructura de la página, listeners, ausencia de persistencia y accesibilidad.

`scripts/test-web-study-practice-shortcuts-b182-browser.mjs` ejecuta **Chromium real** con Vite loopback y una API simulada estrictamente local: sesión autenticada, dos preguntas de la materia, acceso denegado a métodos mutantes. Comprueba que no haya atajos antes de consentir, que escribir en un textarea no cambie de pregunta, avanzar, revelar, retroceder, desactivar, pérdida de autenticación y **cero escrituras HTTP**.

El test B182 está incorporado al `pnpm test` general. Ni la UI ni el test aceptan privilegios o estados de negocio simulados para producción; las simulaciones están aisladas en pruebas locales de loopback.

## Validación local

- `corepack pnpm install --frozen-lockfile --filter los-apuntes --filter @losapuntes/web...` — PASS.
- `corepack pnpm test:web-study-practice-shortcuts-b182` — PASS, 10/10.
- `node scripts/test-web-study-practice-shortcuts-b182-browser.mjs` — PASS, aislamiento editable, avanzar/revelar/retroceder, opt-out y pérdida de autenticación.
- `corepack pnpm --filter @losapuntes/web check:types`, `lint`, `format:check` y `build` — PASS.
- `git diff --check origin/main...HEAD` — PASS.
- `corepack pnpm audit --prod --audit-level high` — FAIL con 2 HIGH (`node-forge`, `braces`) y 3 MODERATE; no reporta `follow-redirects`. Sin waiver.
- No se ejecutó CI desde este carril. Los checks existentes pueden iniciarse automáticamente al abrir o actualizar la PR.

## Estado de release
B182 no modifica Mongo, API, Mobile, contratos públicos, dependencias o lockfile, waivers ni políticas de despliegue. El audit productivo continúa en FAIL por `node-forge` #133 y `braces` #141; `follow-redirects` se corrigió en B190/#543. B178 #513 observa la disponibilidad futura de parches, pero no cambia la autorización. El issue #353 continúa en HOLD. Este bloque no autoriza la release.
