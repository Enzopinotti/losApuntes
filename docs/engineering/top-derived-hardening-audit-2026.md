# Auditoría TOP → Los Apuntes — hardening Web, Mobile, Files y producción

**Fecha:** 2026-09-29  
**Control tower:** #89  
**Base auditada de Los Apuntes:** `main@e8325080f68f444a6889f3bff5cd7cf5d8f65738`

## 1. Objetivo

Usar `Enzopinotti/TOP` como repositorio de aprendizaje técnico y operativo para prevenir en Los Apuntes problemas ya descubiertos durante la evolución de Web, Mobile, Files, Auth, CI y producción.

La regla no es copiar TOP. Cada hallazgo se clasifica como:

1. ya cubierto en Los Apuntes;
2. patrón probado/mergeado en TOP que conviene adaptar;
3. riesgo todavía abierto en TOP que conviene diseñar preventivamente;
4. no aplicable al stack/producto actual.

## 2. Universo revisado

La auditoría recorrió el inventario completo visible del repositorio TOP:

- 389 issues reales;
- 742 pull requests;
- issues abiertos y cerrados;
- PRs abiertos, cerrados y mergeados;
- familias Auth, Web, Mobile, Files, Notifications, seguridad, privacidad, observabilidad, CI/release, lifecycle y operaciones.

No se toma un issue abierto de TOP como una solución validada. Los issues abiertos aportan riesgo, threat model y criterios de aceptación. Los PRs mergeados aportan patrones implementados, pero igualmente deben adaptarse y validarse contra el stack de Los Apuntes.

## 3. Hallazgos que Los Apuntes ya cubre

### Files upload authority

No abrir deuda duplicada por el problema descrito en TOP #1131.

Los Apuntes ya tiene:

- upload intent inmutable;
- object key no expuesto como autoridad de producto;
- PUT firmado con `If-None-Match: *`;
- `content-length` firmado;
- runtime smoke que prueba rechazo de un body con tamaño distinto al intent;
- exact size + content type revalidation al finalizar;
- verificación de firma/prefijo de bytes;
- finalize idempotente;
- single asset claim;
- cleanup con claim previo y retry durable.

Esto también absorbe el patrón de single-write de TOP PR #896.

### Auth server authority

La base actual ya incluye:

- AuthSession opaca y revocable;
- credential-version/generation fencing;
- Web sin bearer persistido;
- Mobile contract separado del transporte Web;
- errores sanitizados;
- controles distribuidos de abuso;
- PROD-008 integrado.

TOP PR #902 sigue siendo referencia conceptual para revisar cualquier nuevo lector directo de AuthSession: toda autoridad debe respetar la generación vigente.

### CI / exact candidate

Los Apuntes ya usa:

- exact-head verification;
- quality gate;
- critical coverage;
- dependency audit;
- container runtime smoke;
- post-merge verification.

No reutilizar greens de SHAs anteriores como evidencia de cierre.

## 4. Adopciones P0 antes de Beta pública

### #90 — Web Auth foreground + principal boundary

Referencia: TOP #1021 / PR #1031 y TOP #1015.

Adoptar:
- revalidación de Auth al recuperar focus/visibility;
- dedupe y bounded staleness;
- transient state ligado al principal;
- network failure != logout.

### #91 — private signed downloads no-store

Referencia: TOP #1058 / PR #1066.

Separar tres lifetimes:
- signed URL lifetime;
- client state lifetime;
- HTTP response-cache lifetime.

Los bytes privados deben responder con política equivalente a `Cache-Control: private, no-store`.

### #93 — public edge privacy/security

Referencias: TOP #1046/#1059, #1060, #1061, #1123, #1125.

Adoptar:
- authenticated/private JSON no-store;
- access logs sin query strings;
- HTTP→HTTPS;
- HSTS en el terminador TLS;
- CSP explícita sin wildcard;
- Permissions-Policy;
- SPA shell revalidable + hashed assets immutable;
- coarse request-rate/concurrency budget;
- client-IP sólo desde boundary confiable.

### #94 — secret least privilege por proceso

Referencia: TOP #1074.

PROD-010 prueba procedencia/revisión de secrets, pero no basta con que el proceso “no lea” un secreto. Debe no recibirlo.

Separar al menos:
- API;
- Files worker;
- storage/bootstrap;
- futuros migrate jobs.

### #95 — client observability

Referencia: TOP #1098.

Web/Mobile deben poder reportar fallos de render/runtime con un envelope:
- bounded;
- sanitizado;
- release-aware;
- sin token, signed URL, body, email o PII arbitraria.

### #99 — PROD-017 observabilidad operativa

Referencias: TOP #1019, #1085, #1087, #1084, #1067.

Requerir:
- Worker readiness real, no sólo PID running;
- optional dependency degradation visible;
- alert adapter provider-neutral;
- resource budgets;
- graceful shutdown budget;
- diagnostics secret-safe.

### #101 — Web async authority fencing

Referencia: TOP #956 y patterns de #949/#974.

Toda completion async sensible debe demostrar que sigue perteneciendo a:
- principal/session generation;
- academic context generation;
- resource/view scope.

AbortController no reemplaza el generation fence.

## 5. P1 antes de exposición amplia de producto

### #92 — malware scan/quarantine

Referencia: TOP #1118, actualmente abierto.

Usar como threat model, no como implementación validada.

El flujo de Files debe poder evolucionar a:

`pending -> verified -> scan_pending/quarantine -> clean -> ready/shareable`

### #96 — offboarding / data lifecycle

Referencia: TOP #1107 y #1035.

Definir explícitamente:
- restrict/suspend;
- close;
- delete;
- anonymize;
- export;
- retention;
- backup retention.

### #97 — durable security audit

Referencia: TOP #1106.

Auditar sólo cambios de alto impacto:
- account restrictions;
- Organization managers/verification;
- catalog admin;
- moderation decisions;
- future permissions/claims.

No convertir todo CRUD en event sourcing.

### #98 — Notifications resilient delivery

Referencias: TOP #1000, #1102, #1109.

Principio:
- backend Notification durable = verdad;
- realtime/push = hints/delivery;
- bounded reconciliation;
- bounded fan-out;
- push token = delivery address, nunca authority;
- deep links allowlisted + server revalidation.

### #100 — coherent recovery

Referencias: TOP #1069, #1082, #1070.

Mongo + Files deben formar un recovery set coherente. Un restore válido necesita recuperar metadata y bytes y probar relaciones reales a través del servicio.

## 6. Mobile: absorber en issues existentes, no duplicar

### #7 — Mobile v1

Agregar patrones de TOP:

- TOP #949: backend/ACL/session remain authority;
- TOP #959: single React runtime Web + Expo;
- TOP #974: background/unmount/authority cleanup de media y requests;
- TOP #919: distributable build ligada al API base URL/release observado;
- safe deep links con target allowlist y reauthorization;
- no durable product truth duplicada en AsyncStorage/SecureStore.

### #49 — Mobile Auth

Además:

- credential generation fence;
- AppState fencing;
- foreground revalidation;
- offline/timeout/5xx != logout;
- logout local aunque revoke remoto falle;
- no bearer/provider token en crash/analytics;
- device evidence sigue siendo externa.

## 7. Patrones revisados que no requieren issue nuevo hoy

No abrir un issue por cada patrón de TOP.

Ejemplos:

- Redis memory/ACL: no aplica mientras Los Apuntes no tenga Redis.
- Topi/AI retention/budgets: no aplica mientras no exista ese producto.
- Gym tenant/member invariants: no portar como dominio, sólo sus patrones de authority/lifecycle cuando sean generales.
- Chat-specific thread/search/media features: no copiar hasta que exista una necesidad real de producto.
- PostgreSQL-specific migration semantics: traducir sólo si/when la decisión de persistencia introduce ese runtime.

## 8. Reglas permanentes

### Authority

Client state, deep links, signed URLs, push tokens, cached selectors y route params nunca crean autoridad.

### Async

Toda request que pueda sobrevivir a un cambio de principal/contexto requiere generation/scope fencing.

### Files

Autorización de producto y entrega de bytes son capas distintas.

### Mobile

No inventar una segunda base de verdad local para datos que el servidor ya gobierna.

### Release

Source green no equivale a runtime/device/provider green.

### Operations

`running` no equivale a `ready`, y `ready` no equivale a “todas las capabilities están healthy”.

## 9. Issue map

- #89 — control tower;
- #90 — Web Auth foreground/principal;
- #91 — private Files cache;
- #92 — malware/quarantine;
- #93 — public edge privacy/security;
- #94 — secret least privilege por proceso;
- #95 — client observability;
- #96 — data lifecycle/offboarding;
- #97 — security audit ledger;
- #98 — Notifications resilience/push;
- #99 — PROD-017 observability/runtime;
- #100 — coherent recovery;
- #101 — Web async authority fencing.

## 10. Orden de ejecución recomendado

1. #91 — pequeño, alto impacto y muy acotado.
2. #90 + #101 — Web session/context convergence.
3. #94 — cerrar separación de secrets mientras PROD-010 está fresco.
4. #99 — continuar el ledger B05 con PROD-017.
5. #93 — edge público cuando exista configuración productiva concreta.
6. #95 — antes de Beta externa desatendida.
7. #98 — junto con Notification/Mobile productization.
8. #92/#96/#97/#100 — antes de exposición amplia y datos irremplazables según milestone.

El orden puede variar por dependencias reales, pero no debe saltarse un gate externo fingiendo que CI lo probó.
