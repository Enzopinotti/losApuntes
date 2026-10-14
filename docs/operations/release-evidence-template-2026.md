# Los Apuntes 2026 — ficha de evidencia de release (plantilla)

**Estado inicial obligatorio: PENDIENTE / NO EJECUTADO.**
No copiar `PASS` de otra build ni completar con datos ficticios. Guardar la
ficha final en un destino controlado por el equipo; el repositorio puede
contener referencias no secretas, no credenciales ni artefactos sensibles.

## Identidad exacta

| Campo | Valor / referencia |
| --- | --- |
| Fecha y responsable | PENDIENTE |
| Decisión solicitada: QA / Beta / Público | PENDIENTE |
| Commit exacto de `main` | PENDIENTE |
| PRs concurrentes incluidos/excluidos | PENDIENTE |
| Node / pnpm / lockfile hash | PENDIENTE |
| API release id + SHA observado | PENDIENTE |
| Web image/digest + source SHA | PENDIENTE |
| Mobile binary SHA, app/build/profile | PENDIENTE |
| Mobile API origin y release observados | PENDIENTE |
| Entorno (sin URL privada, tokens ni usuarios) | PENDIENTE |

## Gate 1 — Calidad de repositorio

| Evidencia | Estado | Salida exacta / link no sensible |
| --- | --- | --- |
| `pnpm check` sobre el mismo SHA | NO EJECUTADO | PENDIENTE |
| `pnpm audit:prod` separado | NO EJECUTADO | PENDIENTE |
| `pnpm security:audit-exceptions` + expiry | NO EJECUTADO | PENDIENTE |
| `pnpm test:auth-browser-e2e` si aplica | NO EJECUTADO | PENDIENTE |
| CI del SHA exacto | NO EJECUTADO | PENDIENTE |
| `pnpm runtime:smoke` en entorno descartable | NO EJECUTADO | PENDIENTE |

**Bloqueo:** `pnpm check` verde no equivale a `pnpm audit:prod`
verde; el upstream de `braces` y el expiry de `node-forge` siguen
los issues [#141](https://github.com/Enzopinotti/losApuntes/issues/141)
y [#133](https://github.com/Enzopinotti/losApuntes/issues/133).
No borrar ni renovar excepciones automáticamente.

## Gate 2 — Entorno, identidad, edge y proveedores

| Evidencia | Estado | Referencia canónica |
| --- | --- | --- |
| `release:qualify-live` contra Web/API públicos + expected SHA | NO EJECUTADO | [#83](https://github.com/Enzopinotti/losApuntes/issues/83) |
| Browser cache caliente y rollback A→B→A | NO EJECUTADO | #83 |
| HTTPS/HSTS/CSP, cache policy y 429 real desde edge | NO EJECUTADO | [#80](https://github.com/Enzopinotti/losApuntes/issues/80) |
| Email verification/recovery con proveedor transaccional real | NO EJECUTADO | [#48](https://github.com/Enzopinotti/losApuntes/issues/48) |
| Google OAuth Web/Android/iOS donde esté habilitado | NO EJECUTADO | #48, [#49](https://github.com/Enzopinotti/losApuntes/issues/49) |
| Cookies, same-origin, proxy hops y credenciales secret manager | NO EJECUTADO | #48 |
| Terms/Privacy, retención y decisiones legales | NO EJECUTADO | #48, [#82](https://github.com/Enzopinotti/losApuntes/issues/82) |

No usar proveedores falsos para declarar estos gates cumplidos.

## Gate 3 — Seguridad, recuperación y operaciones

| Evidencia | Estado | Referencia canónica |
| --- | --- | --- |
| Backup coherente Mongo+Files off-host, cifrado | NO EJECUTADO | [#100](https://github.com/Enzopinotti/losApuntes/issues/100) |
| Restore drill aislado + Worker/API + signed download | NO EJECUTADO | #100 |
| RPO/RTO observados y acta de cleanup | NO EJECUTADO | #100 |
| ClamAV/equivalente real con límite 50 MiB y outage drill | NO EJECUTADO | [#87](https://github.com/Enzopinotti/losApuntes/issues/87) |
| Presupuestos CPU/RAM/PID/disk/log medidos | NO EJECUTADO | #87 |
| Alerts provider/on-call, readiness/degraded/recovery drill | NO EJECUTADO | [#99](https://github.com/Enzopinotti/losApuntes/issues/99) |

No ejecutar restauraciones destructivas ni borrar volúmenes para completar
esta ficha. Usar únicamente el runbook existente en [recovery.md](./recovery.md).

## Gate 4 — Producto y dispositivos reales

| Evidencia | Estado | Referencia canónica |
| --- | --- | --- |
| Instalación firmada de la build exacta Android | NO EJECUTADO | [#7](https://github.com/Enzopinotti/losApuntes/issues/7) |
| Instalación firmada de la build exacta iOS | NO EJECUTADO | #7 |
| Registro → verificación → login → contexto → Buscar → abrir/guardar/subir | NO EJECUTADO | #7, #49 |
| Google real, recuperación, sesiones, logout | NO EJECUTADO | #49 |
| Inicio/Buscar/Guardados/preguntas con cambios de cuenta y red | NO EJECUTADO | #7 |
| VoiceOver y TalkBack, teclado, background/foreground | NO EJECUTADO | [#85](https://github.com/Enzopinotti/losApuntes/issues/85) |
| Exportación completa disponible o expresamente fuera de esta beta | NO CONFIRMADO | [#183](https://github.com/Enzopinotti/losApuntes/issues/183) |
| Plan de notificaciones/retención de datos | PENDIENTE | [#79](https://github.com/Enzopinotti/losApuntes/issues/79), #82 |

## Registro de decisiones de salida

**Bloqueantes sin cierre:** PENDIENTE  
**Riesgos aceptados expresamente:** PENDIENTE (link a dueño + motivo + fecha)  
**Owner Producto:** PENDIENTE  
**Owner Seguridad:** PENDIENTE  
**Owner Operaciones:** PENDIENTE  
**Decisión final:** **NO DETERMINADA**; no escribir GO/BETA PASS
hasta completar evidencia de los gates aplicables.

Este documento no hace llamadas a producción ni constituye una
aprobación. Véase el mapa de alcance en
[release-readiness-ledger-2026-10-14.md](./release-readiness-ledger-2026-10-14.md).
