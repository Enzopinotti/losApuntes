# B133 — Diagnóstico de auditoría de dependencias productivas sin excepciones

**Base:** `main@c65aeca895d6c354fb70a8564f58397a988958b7` (B132). **Release:** #353 **HOLD**; `STUDY_PROGRESS_ENABLED=false`.

## Hallazgo y alcance

La ejecución real del workflow `verify` de B132 (job Production dependency audit, 19-10-2026) falló con **2 altas** y **3 moderadas** en el grafo productivo del monorepo:

- `node-forge`: GHSA-86w9-cpqp-85rv, issue #133. Entra por herramientas de Expo y firmas nativas.
- `braces`: GHSA-vfj7-8cjw-p6xm, issue #141. Entra por Metro/micromatch.
- Según los avisos revisados a la fecha de este bloque, ninguno ofrece todavía una versión parcheada. Eso **no autoriza** excepciones, overrides, forks no revisados ni cierre de los issues.

**B133 no remedia todavía las bibliotecas vulnerables.** Añade un clasificador diagnóstico, sin alteración de dependencias ni de la política de auditoría.

## Contrato del clasificador

`scripts/security/triage-production-audit.mjs` recibe **JSON producido por un escaneo real** (`pnpm audit --prod --json`), nunca reconstruye hallazgos de archivos hardcodeados:

- Distingue coincidencias exactas de paquete + GHSA + severidad alta hacia #133/#141.
- Marca *cada* hallazgo alto o crítico como `ACTIVE_HIGH_OR_CRITICAL`, sea conocido o no.
- Si cambia el paquete, la severidad o aparece un aviso nuevo: `UNREVIEWED_HIGH_OR_CRITICAL`; ningún GHSA actúa como allowlist.
- Si el esquema falta, las cuentas no coinciden o el JSON es inválido: `INVALID_EVIDENCE`. Los ejemplos con JSON vacío no equivalen a un audit PASS.
- Un resultado sin altas solo alcanza `REVIEW_REQUIRED`, **jamás GO** ni `productionAuditCertified=true`.

Se imprime solo un resumen JSON: cuentas, códigos, issues referidos; no se vuelcan rutas internas ni payloads arbitrarios de los avisos.

## Integración y uso

```sh
node --test scripts/security/triage-production-audit.test.mjs

pnpm audit --prod --json > /tmp/los-apuntes-prod-audit.json
node scripts/security/triage-production-audit.mjs /tmp/los-apuntes-prod-audit.json
```

El auditor puede devolver código 1 aun cuando genere un JSON válido; se debe inspeccionar el segundo comando **sin ocultar** el estado del primero. El workflow general ejecuta una clasificación informativa con `continue-on-error` y **preserva** el paso obligatorio preexistente `pnpm audit --prod --audit-level high`; si hay altas, ese gate sigue fallando. El workflow B133 valida contrato local contra el SHA exacto (sin requerir un servicio externo, ni tocar producción).

## Aceptación real pendiente

Para levantar el HOLD se precisa consumir versiones upstream revisadas, actualizar y congelar el lockfile, repetir el escaneo productivo completo, verificar los builds/contratos Mobile y todos los gates de #353. Deben mantenerse abiertos #133 y #141 hasta que la remediación real esté demostrada. Este bloque no cambia `STUDY_PROGRESS_ENABLED`, Docker, API, Web ni los datos de usuarios.
