# B194 — Aceptación de navegador: password toggle + Dashboard vigente

**Origen:** B193 [#606](https://github.com/Enzopinotti/losApuntes/pull/606), head `cf190a1ee2a92341a58eaa8ed35cee59b79e8be2`. **Base de este carrier:** `main@0e6701a566c83406cd484c60109d321a6cc4c023`. **Estado:** Draft, no merge sin pruebas, release HOLD #353, #133 y #141.

## Falla observada, no supuesta

En el [segundo Container runtime smoke de B193](https://github.com/Enzopinotti/losApuntes/actions/runs/39786538802/job/119853551520) MongoDB 8, Mailpit, RustFS, API y trabajadores iniciaron correctamente y el navegador llegó **más lejos que el error del selector**. El login respondió HTTP 200 y el navegador navegó a `/dashboard`. A continuación el navegador agotó 30 segundos esperando el `heading` **"Tu espacio en Los Apuntes"**. El Dashboard actual de `main`, en `apps/web/src/pages/Dashboard.tsx`, contiene en cambio el `h1#dashboard-title` **"¿Qué querés hacer hoy?"**.

La causa es un aserto E2E obsoleto, **no** un certificado de que el flujo autenticado completo funcionó: los demás smokes se interrumpieron por el fallo temprano.

## Cambios

1. **Port atómico y verificable de B193:** se comparó el blob actual de `scripts/auth-browser-e2e.mjs` (`8599d77670b14d4d9c571f9f57fd70a407bab643`) con el archivo exacto del head B193 (`d0d5b02619e4b54556ac74aa311d58cb1a9c3b6e`) antes de portar los ajustes de labels `exact: true` y tabulación accesible (email → input contraseña → botón mostrar/ocultar → submit). La rama nace del último main sin aplicar ramas anteriores completas.
2. Se cambia **una única expectativa visible** en el navegador: `getByRole("heading",{name:"¿Qué querés hacer hoy?",exact:true})` después de `waitForURL("/dashboard")`. No se altera el título real, la ruta del usuario, sus permisos ni el login.
3. Se porta la prueba ligera B193 que impide que reaparezcan selectors de contraseña ambiguos.
4. Se añade prueba B194 que comprueba simultáneamente el H1 React real y el aserto Playwright, además de conservar verificación de login 200, session cookie HttpOnly/Secure/SameSite y `/auth/me`.
5. El workflow global exige las dos pruebas `node:test` antes de los pasos costosos de Chromium/Docker. El workflow focal `b194-auth-dashboard-browser-contract.yml` comprueba el SHA exacto sin descarga de dependencias.

## Riesgo de PRs paralelos

Los PR [#606](https://github.com/Enzopinotti/losApuntes/pull/606) y [#660](https://github.com/Enzopinotti/losApuntes/pull/660) están abiertos y también afectan `scripts/auth-browser-e2e.mjs`. Este carrier es una **alternativa consolidada** que incorpora el ajuste de confirmación ya previsto; no fusionar todos los carriers sin deduplicar y revisar las modificaciones sobre main vigente. No se tocan los proyectos Web/Mobile en sus ramas ajenas.

## Gates obligatorios

- [ ] `node --test scripts/test-auth-browser-password-locators.test.mjs scripts/test-auth-dashboard-route-contract.test.mjs` PASS sobre el head final.
- [ ] Quality Gate, cobertura auth y todas las coberturas críticas PASS.
- [ ] **Smoke de navegador con Mongo 8 y servicios reales**: email, password visible/oculta con teclado, login, registro, recuperación, cookie privada, revocación, expiración; luego todos los smokes HTTP de recursos, Q&A, feed, exportación, etc. **No certificar hasta finalizar el job**.
- [ ] Auditar `pnpm audit --prod --audit-level high` sin excepciones. Las HIGH de `node-forge` y `braces` son bloqueantes independientes, y el incidente del navegador no justifica degradar la auditoría ni Mongo.

No cambia contraseña, cuenta, bearer, headers, rutas auth, S3, índices ni feature flags productivos. `STUDY_PROGRESS_ENABLED=false` sigue prohibiendo habilitación productiva hasta aceptación #353.
