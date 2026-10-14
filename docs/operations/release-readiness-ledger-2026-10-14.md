# Los Apuntes 2026 — mapa de cierre por evidencia

**Corte:** 2026-10-14  
**Main al iniciar este documento:** `2682fdf91d7b35f01b3d2a552c36d0f5ca7d5115` (PR #295 incluido).  
**Objetivo:** identificar **qué queda** antes de declarar una beta instalada o
un release público, sin confundir código mergeado con calidad o proveedor
operativo demostrado. Este mapa es un índice de seguimiento: las issues
enumeradas siguen siendo la fuente canónica de alcance y cierre.

**IMPORTANTE:** El código reciente de los bloques 17–29 fue integrado con
`[skip ci]` por decisión del carril de desarrollo acelerado. No extrapolar
pruebas antiguas de SHA previo al árbol actual. Al momento de este corte
NO se ejecutó un `pnpm check` acumulado nuevo sobre este HEAD.

## 1. Prioridades bloqueantes para beta / lanzamiento

| Prioridad | Canon | Estado de repositorio documentado | Qué falta demostrar / decisión |
| --- | --- | --- | --- |
| P0 — Dependencias | [#141](https://github.com/Enzopinotti/losApuntes/issues/141) | Auditoría previa reportó `braces@3.0.3` vulnerable vía Expo/Metro, sin actualización segura documentada | Revisar upstream + grafo actual + `pnpm audit:prod`; NO silenciar con override/ignore indiscriminado; resolver o documentar una decisión de riesgo real |
| P0 — Excepción con vencimiento | [#133](https://github.com/Enzopinotti/losApuntes/issues/133) | Excepción exacta de `node-forge@1.4.0` para CVE-2026-85393, limitada a Expo tooling | **Expira 2026-10-15** según issue. Resolver, eliminar o revalidar por seguridad; NO prorrogar automáticamente ni debilitar checker |
| P0 — Calidad exacta del código | [#7](https://github.com/Enzopinotti/losApuntes/issues/7), [#83](https://github.com/Enzopinotti/losApuntes/issues/83) | Core Mobile + QA scripts ya existen; PR #295 agregaba más cambios sin check acumulado | Ejecutar quality gate sobre HEAD congelado; registrar SHAs y resultados; instalaciones iOS/Android y UX nativa real |
| P0 — Release real | [#83](https://github.com/Enzopinotti/losApuntes/issues/83) | Release identifiers/manifest y `release:qualify-live` implementados | HTTPS real Web/API, SHA/API target, cache shell/assets, rollback A→B→A en browser caliente; signing + device/store aparte |
| P0 — Identidad/operaciones | [#48](https://github.com/Enzopinotti/losApuntes/issues/48), [#49](https://github.com/Enzopinotti/losApuntes/issues/49) | Web/Mobile auth, sesiones y Google native code integrado | Email transaccional, OAuth real Web/iOS/Android y consentimiento, secretos frescos, HTTPS/cookies, edge abuse, políticas legales y pruebas del proveedor |
| P0 — Continuidad de datos | [#100](https://github.com/Enzopinotti/losApuntes/issues/100) | Contrato coherente Mongo + Files y scripts de recuperación implementados | Backup durable off-host cifrado, restore drill aislado, API+worker, descarga autorizada, RPO/RTO observados y cleanup |
| P0 — Runtime y seguridad de ficheros | [#87](https://github.com/Enzopinotti/losApuntes/issues/87) | Recovery separado a #100; límites genéricos diseñados | Presupuestos CPU/RAM/PIDs/disco medidos, scanner antivirus real para 50 MiB, cuarentena fail-closed, logs acotados y rollback compatible |
| P0 — Ingress | [#80](https://github.com/Enzopinotti/losApuntes/issues/80) | API cache `no-store`, logs query-blind y admission budgets implementados | TLS/HSTS/CSP, proxy hops, bloqueo de bypass directo, rate/concurrency budgets y 429 end-to-end en el **edge real** |
| P0 — Monitoreo | [#99](https://github.com/Enzopinotti/losApuntes/issues/99) | Health API/worker y boundary de alertas implementados | Configurar destino/on-call, umbrales medidos, restart/backlog/disk/TLS y simulacro de incidente y recuperación |

## 2. Trabajo de producto / legal pendiente (no es sólo QA)

| Prioridad | Canon | Pendiente |
| --- | --- | --- |
| P1 — Exportación usuario | [#183](https://github.com/Enzopinotti/losApuntes/issues/183), [#82](https://github.com/Enzopinotti/losApuntes/issues/82) | Exportación completa de dominios, armado de artefacto, entrega reautorizada y autoservicio. PR **#230** estaba abierto en paralelo; no duplicar ni cerrar por anticipado |
| P1 — Ciclo de datos | [#82](https://github.com/Enzopinotti/losApuntes/issues/82) | Retención legal/backup, auditoría de mutaciones de alto impacto y decisiones de anonimización/purga. NO borrar FileAssets reclamados por cierre de cuenta |
| P1 — Accesibilidad y UX | [#85](https://github.com/Enzopinotti/losApuntes/issues/85) | QA real de keyboard, focus, zoom, TalkBack, VoiceOver y cleanup futuro de medios cámara/voz. Parte de código ya está; falta evidencia |
| P1 — Notificaciones | [#79](https://github.com/Enzopinotti/losApuntes/issues/79) | Política explícita de retención/replay antes de borrar registros; push es scope futuro condicionado a lifecycle de instalación y proveedor real |
| P1 — Carriles web activos | [PR #273](https://github.com/Enzopinotti/losApuntes/pull/273), [PR #206](https://github.com/Enzopinotti/losApuntes/pull/206) | Revisar/conciliar sus head SHAs y paths; no atribuirles integración mientras permanezcan abiertos |
| P2 — Identidad futura | [#54](https://github.com/Enzopinotti/losApuntes/issues/54) | Browser E2E, evaluación de KDF por medidas reales, MFA/passkeys y recuperación; priorizar según beta/release, no presentar como ya disponible |
| Producto amplio | [#1](https://github.com/Enzopinotti/losApuntes/issues/1) | Seguir contraste contra producto y estrategia; un epic abierto no representa una lista cerrada de funcionalidades obligatorias |

## 3. Orden operativo propuesto para el corte de calidad

**Paso A — Freeze técnico, sin afirmaciones anticipadas.**
Elegir un SHA de `main` después de resolver los PRs concurrentes. Anotar
`git rev-parse HEAD`, la URL del commit y la lista de PRs incluidos.
No mezclar resultados de otra revisión ni correr limpieza destructiva.

**Paso B — Quality Gate reproducible sobre ese SHA.**
Con Node 24 y pnpm 9.15.9 según `package.json`:
- `pnpm check` — higiene, formato, lint, typecheck, tests y builds;
- `pnpm audit:prod` **separado** — registrar hallazgos reales sin silenciar;
- `pnpm security:audit-exceptions` — comprobar el alcance/expiración del
  carve-out, sin inventar nuevas excepciones;
- `pnpm test:auth-browser-e2e` sólo con el fixture/browser target previsto
  y evidencia de que no es un proveedor OAuth real.

Estos comandos no se ejecutaron durante los bloques rápidos.

**Paso C — Runtime aislado de QA, no producción.**
`pnpm runtime:up` y `pnpm runtime:smoke` requieren Docker/servicios
aislados y un operador que acepte sus mutaciones sobre el entorno de prueba.
`pnpm runtime:down` lleva `--volumes`: **destructivo**, usar únicamente
si la pila de prueba es descartable. Nunca ejecutar sobre volúmenes útiles.

**Paso D — Evidencia externa obligatoria.**
Correr `pnpm release:qualify-live` contra la dupla HTTPS Web/API real con
SHA esperado; verificar `#83`, `#48`, `#80`. Ejecutar backup/restore
según [recovery.md](./recovery.md), no con comandos improvisados; cerrar
`#100` solo con drill aislado, off-host y RPO/RTO. Completar OAuth/email,
scanner, alertas y evidence de móvil instalado en dispositivos reales.

**Paso E — Decisión de release.**
Sólo puede declararse **VALIDADO** aquello que tenga:
- SHA exacto y dueño/fecha de la comprobación;
- entorno/cliente/endpoint API observados;
- comando o procedimiento y salida/evidencia verificable;
- regresiones resueltas o riesgo aceptado explícitamente por el responsable;
- link a issue canónico y corrección de docs si el alcance cambió.

La decisión Beta/Público necesita firma de producto, seguridad y
operaciones; un PR `[skip ci]` mergeado **no** constituye certificación.

## 4. Registro de bloque reciente

| PR | Alcance | Estado |
| --- | --- | --- |
| [#290](https://github.com/Enzopinotti/losApuntes/pull/290) | Guardados sincronizados foreground | Integrado, no validado en acumulado |
| [#291](https://github.com/Enzopinotti/losApuntes/pull/291) | Abiertos recientemente solo sesión | Integrado, no validado |
| [#292](https://github.com/Enzopinotti/losApuntes/pull/292) | Recientes por materia actual | Integrado, no validado |
| [#293](https://github.com/Enzopinotti/losApuntes/pull/293) | Otros recursos recientes misma materia | Integrado, no validado |
| [#294](https://github.com/Enzopinotti/losApuntes/pull/294) | Deep link a Buscar por materia | Integrado, no validado |
| [#295](https://github.com/Enzopinotti/losApuntes/pull/295) | Materia + keywords + recovery | Integrado, no validado |

## 5. Qué NO debemos hacer para «terminar más rápido»

- No cerrar las issues de evidencias externas con mocks, capturas
  simuladas o una afirmación de CI-green del SHA anterior.
- No silenciar #141 ni extender #133 sin revisión y evidencia upstream.
- No hacer `docker compose down --volumes`, `mongorestore --drop`,
  `prune` global ni purga de Files/Notifications sobre datos reales.
- No subir secrets, firmados, dumps, certificados o tokens al repositorio.
- No afirmar «todos los features terminados»: el alcance de #1, #54,
  #79 y #82 contiene decisiones futuras de producto, seguridad y legal.
- No correr varias ramas modificando los mismos archivos, ni integrar PRs
  de otros carriles sin revisar `head_sha` exacto y su delta frente a main.

Este documento es un **inventario trazable en un momento dado**, no
evidencia de ejecución. Antes de usarlo para un go/no-go, volver a leer
las issues abiertas y el HEAD real: pueden cambiar durante el trabajo
paralelo.
