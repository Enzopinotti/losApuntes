# B193 — Recuperación del smoke de navegador después del botón de visibilidad de contraseña

**Fecha:** 2026-10-22. **Base de la rama:** `main@4521e788f3e7e1e40a3d18313989e58b59f13a6b`. **Objetivo:** corregir un fallo de prueba real sin reducir la accesibilidad de la aplicación ni modificar la autenticación.

## Evidencia de incidente observada

El workflow global de [B192 PR #600](https://github.com/Enzopinotti/losApuntes/pull/600), head `6de9e8c331e7549b9c2188374a024624d5703f2c`, terminó con **19 checks PASS**, y fallos de `Production dependency audit`, `B192 unwaived production HIGH audit` y `Container runtime smoke`.

En [Container runtime smoke, job 119814049160](https://github.com/Enzopinotti/losApuntes/actions/runs/39775126797/job/119814049160) el contenedor **MongoDB 8.0.34 inició correctamente**, Compose y el runtime levantaron y `pnpm test:auth-browser-e2e` llegó al navegador. Playwright falló al buscar `getByLabel("Contraseña")`: hubo **dos resultados**, el `input#login-password` y el control accesible `button[aria-label="Mostrar contraseña"]`. No se trató de una falla del motor Mongo ni de los cambios de Study Progress; cambiar de runner o degradar Mongo no corrige la causa. El error ocurrió antes de los otros smokes HTTP por el orden del pipeline.

Los selectores de login inicial y login tras recuperación repetían el mismo patrón. El registro inicial también tenía un `getByLabel("Confirmar contraseña")` sin coincidencia exacta, susceptible al botón `Mostrar confirmar contraseña`. Otros selectores ya usaban `{exact:true}`.
### Segundo defecto expuesto por Chromium real en el primer intento B193

En [PR #606 — Container runtime smoke, job 119849273171](https://github.com/Enzopinotti/losApuntes/actions/runs/39785537009/job/119849273171) quedó confirmada la corrección de la ambigüedad inicial: el navegador avanzó hasta la prueba de teclado. Los contenedores Mongo 8, RustFS, Mailpit, API y workers quedaron healthy. La ejecución encontró un *segundo* contrato de prueba desactualizado: tras escribir la clave, un único `Tab` ya no llega a «Iniciar sesión», porque el botón de mostrar contraseña añadió correctamente un elemento enfocable. El test se corrige para exigir primero foco en «Mostrar contraseña», luego otro `Tab` hasta «Iniciar sesión» y finalmente envío con Enter. Es una aceptación de la nueva accesibilidad real y **no** se quita el botón del orden de tabulación. El test de contrato ligero comprueba que exista este paso. La corrida posterior en el HEAD actualizado es la única que puede validar el smoke completo.


## Implementación atómica

1. Se mantiene el campo como **input con label real**, sin depender de CSS, placeholder, ID inventado o coincidir por substring. Se exige `getByLabel("Contraseña", { exact: true })` tanto en login inicial como al regresar de recuperación de clave.
2. Se aplica coincidencia exacta al campo `Confirmar contraseña` del registro.
3. El smoke de navegador ejercita la accesibilidad que originó la ambigüedad: `getByRole("button",{name:"Mostrar contraseña", exact:true})`, vínculo `aria-controls="login-password"`, `type=password -> text -> password` al mostrar y ocultar de nuevo, y botón `Ocultar contraseña`.
4. `scripts/test-auth-browser-password-locators.test.mjs` es una suite `node:test` sin mocks de la app. Rechaza cualquier búsqueda de los tres nombres de contraseñas sin `exact:true` en el smoke, protege ambos flujos de login y exige conservar el botón accesible con `aria-controls`, `aria-pressed` y cambio real de `type`.
5. `.github/workflows/ci.yml` añade el preflight de contrato antes de instalar Chromium/levantar servicios. `.github/workflows/b193-auth-password-smoke-contract.yml` lo ejecuta rápidamente sobre el SHA exacto del PR con Node24 y checkout inmutable. **El preflight estático no reemplaza la ejecución de navegador real.**

## Criterios de aceptación

- `node --test scripts/test-auth-browser-password-locators.test.mjs` PASS, cero skips y fuente limpia.
- `Node24 API/Web/Mobile`, lint, tests y Quality Gate existentes sin rebajar.
- **El global Container runtime smoke sobre el HEAD final debe pasar**: Chromium/Playwright completo (verificar login, registro, recuperaciones de contraseña, revocación, expiry), MongoDB 8 con `rs0`, RustFS, Mailpit y todo el conjunto de smokes HTTP. El contrato estático no permite afirmar PASS del E2E por sí solo.
- `pnpm audit --prod --audit-level high` mantiene fallo legítimo mientras continúen `node-forge` y `braces`, issues [#133](https://github.com/Enzopinotti/losApuntes/issues/133) y [#141](https://github.com/Enzopinotti/losApuntes/issues/141). Sin waivers, desactivar dependencias de seguridad, bajar umbrales ni quitar `needs` de CI.
- No se modifican rutas auth, contraseñas, permisos, tokens, Mongo, S3, modelos ni `STUDY_PROGRESS_ENABLED=false`. El gate de publicación [#353](https://github.com/Enzopinotti/losApuntes/issues/353) permanece HOLD.

**Estado:** rama/PR Draft hasta prueba real y revisión del `main` definitivo. Un éxito del smoke no sustituye la auditoría HIGH.
