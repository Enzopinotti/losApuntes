# B216 — Atajos optativos para el Modo concentración (Study Runner)

**Fecha:** 23 de octubre de 2026. **Base:** `main@fb52a1d681d26767d1aa2402438bf9e1954157a7`. **Alcance:** Web `/study/run`, exclusivamente dentro de una sesión importada, autenticada y verificada.

## Objetivo de producto

Un estudiante puede recorrer las actividades y controlar el reloj sin desplazarse continuamente entre el final de la lista y el cronómetro, especialmente cuando usa teclado o herramientas de accesibilidad. Este flujo **no automatiza** el aprendizaje: todas las marcas de completado, valoraciones, sincronizaciones y exportaciones mantienen sus botones originales.

La interfaz presenta una sección *Controlá tu sesión con el teclado*, apagada por defecto. El usuario decide si activa los atajos:

| Atajo | Acción | Condición |
| --- | --- | --- |
| `Mayús + J` | Actividad anterior | Existe anterior, sin mutación o carga activa |
| `Mayús + K` | Actividad siguiente | Existe siguiente, sin mutación o carga activa |
| `Mayús + P` | Pausar o reanudar el reloj | Contenido accesible, tarea pendiente, reloj con tiempo disponible, documento visible y ninguna operación remota en curso |

## Protecciones

- El helper puro `study-runner-shortcuts.mjs` acepta únicamente las tres acciones incluidas en una lista cerrada, cuando el evento trae Shift y **no** Control, Alt, Meta, IME, repetición ni un evento ya atendido. No consume combinaciones extrañas.
- Al escribir en `input`, `textarea`, `select`, `contenteditable`, textbox o combobox, no captura atajos. El botón de activación puede retener foco: pulsar teclas sigue funcionando para estudiantes que navegan solo por teclado.
- `preventDefault` solo ocurre **después** de confirmar que la acción está autorizada. Los botones de autoría/progreso siguen siendo el único modo de cambiar tareas realizadas, valoraciones, borrado o exportación.
- La lógica invoca los métodos **ya existentes** `move` y `changeClock("toggle")`, que a su vez tienen sus guardas de cuenta, scope, tareas y mutaciones; no crea API ni ruta.
- Se registra un listener `window.keydown` **solo** cuando el usuario habilita atajos. Al deshabilitar o desmontar el componente se elimina el listener. Si el navegador oculta la pestaña, el temporizador se pausa por la política original, no por el componente nuevo.
- React remonta la sección al cambiar el sujeto/cuenta/sesión o la identidad del plan, por lo que una nueva sesión no hereda el estado de activación anterior. No se usan `localStorage`, cookies, métricas, analytics ni escritura de datos privados.
- Botón de 44 px, foco visible, disposición móvil, reducción de movimiento y texto de ayuda que identifica las acciones no disponibles en cada momento.

## Pruebas de aceptación

1. `pnpm test:web-study-runner-shortcuts-b216`: **9 grupos de pruebas** deterministas/adversariales de teclas declaradas, modificadores, IME, foco editable, selector de permiso, limpieza de listeners, montaje acotado, UI/ARIA y ausencia de nuevos cambios de progreso. Se incluye en el `pnpm test` monorepo.
2. `scripts/test-web-study-runner-shortcuts-b216-browser.mjs`: Chromium real, Vite loopback y servidor API simulado **solo dentro del test**, usuario autorizado, importación de JSON portable con dos preguntas verificadas, atajos apagados por defecto, navegación siguiente/anterior, prohibición durante select, pausa/reanudación de reloj, desactivación, pérdida de sesión y cero mutaciones HTTP inesperadas.
3. CI focalizada con checkout exacto, Node24/pnpm9 congelado, pruebas, TypeScript, ESLint, Prettier, Chromium y build Vite real, verificando SHA y directorio limpio al concluir.

Los tests simulados **no** prueban permisos productivos remotos: verifican que la integración conserva los controles de autoridad establecidos y solo cambia una interacción local.

## Límites y release

B216 no toca los endpoints API, contratos, base de datos, Mobile, flujo de autenticación, lockfile ni excepciones del audit. La release #353 continúa **HOLD** mientras la auditoría productiva no resulte aprobada sobre el HEAD realmente desplegable. Un PASS focalizado no habilita un merge ni deployment por sí solo.
