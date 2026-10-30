# B279 — Navegación optativa por teclado en Study Runner

**Fecha:** 2026-10-30. **Base de reconciliación:** main `0370600193acac0a59919d019b32e8257c267292`. **Fuente histórica:** [#710 B216](https://github.com/Enzopinotti/losApuntes/pull/710). La rama original estaba apilada sobre un main antiguo, por eso se porta únicamente la funcionalidad y se conserva la integración de Study Runner vigente.

## Objetivo y experiencia

El estudiante que utiliza una sesión académica importada puede habilitar un panel de atajos dentro del Study Runner. Desactivado por defecto, no persiste entre planes/sesiones ni captura el teclado durante la edición. No sirve para marcar tareas realizadas, puntuar respuestas, sincronizar progreso, escribir en la API ni descargar datos.

| Teclas | Acción | Restricción |
| --- | --- | --- |
| Mayús + J | Actividad anterior | Tiene que existir, sin operación pendiente |
| Mayús + K | Actividad siguiente | Tiene que existir, sin operación pendiente |
| Mayús + P | Pausar o reanudar cronómetro | Actividad verificada, pendiente, reloj válido y pestaña visible |

Se muestran el estado de activación (`aria-pressed`) y las combinaciones admitidas. Los controles tienen altura de 44px y foco visible. No se guarda telemetría ni estado en cookies, web storage o URL.

## Autoridad y seguridad

1. `resolveRunnerShortcut` es una función pura con tres acciones cerradas. Rechaza Ctrl, Alt, Meta, repeticiones, IME, eventos previamente atendidos, input, textarea, select, contenteditable, textbox y combobox.
2. Solo se registra `window.keydown` cuando la persona pulsa *Activar atajos*, con desmontaje y cleanup; cada tecla exige autorización local actual y documento visible antes de llamar a los handlers ya implementados.
3. `StudyRunnerShortcuts` se monta únicamente dentro del bloque de tarea cargada, con key asociada a scope, identidad del plan y tareas. El toggle vuelve a false al cambiar de plan.
4. Los permisos remotos siguen siendo responsabilidad del backend y sus endpoints; no hay modificaciones de Auth, MongoDB, contratos o flags. `STUDY_PROGRESS_ENABLED` sigue sin modificarse.

## Pruebas y validación

- `pnpm test:web-study-runner-shortcuts-b279`: eventos adversariales, navegación no destructiva, modificadores, IME, formulario editable, guards de autorización, desmontaje y UI/ARIA.
- `node scripts/test-web-study-runner-shortcuts-b279-browser.mjs`: Vite + Chromium con API simulada únicamente para el test, importación de plan, botones opt-in, anterior/siguiente, cronómetro, aislamiento del editor, cierre de sesión, comprobación de cero mutaciones HTTP.
- Workflow `b279-study-runner-shortcuts.yml`: checkout de SHA exacto, Node24/pnpm9 congelado, tests, TS, lint, Prettier, Chromium y build de Web. Complementado por verify global, 10 coberturas críticas, smoke real y auditoría HIGH.

**Importante:** el harness local de Chromium no sustituye la verificación de seguridad, integración ni disponibilidad del servicio real. El gate de producción permanece en HOLD por node-forge #133 y Zod #705; release #353 no queda habilitado por este cambio.
