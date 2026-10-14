# Bloque 31 — Preflight de evidencia de release, fail closed

**Fecha del bloque:** 2026-10-14  
**Owner de los gates:** #83 (release), #48 (producción), #133/#141 (seguridad).  
**Estado:** código y pruebas escritos, **NO ejecutados**. No reemplaza
`docs/operations/release-evidence.md` (acta canónica del release) ni
`docs/operations/release-readiness-ledger-2026-10-14.md` (mapa de pendientes).

## Objetivo

Después de muchos PRs con `[skip ci]`, el repositorio no debe aceptar un
release basado en una captura de otro SHA o en un checklist marcado como PASS
sin referencias. Este preflight añade un **control local, de solo lectura**,
que detecta un acta incompleta/contradictoria antes de que un owner revise
evidencia real.

**NO aprueba un release.** Incluso con todas las referencias presentes,
devuelve `REVIEW_REQUIRED` y salida 0 (solo indica que el acta está lista
para revisión humana). Para cualquier inconsistencia devuelve `HOLD`
y exit code 2. Un owner debe comprobar la autenticidad y aplicabilidad de
cada referencia, el estado real de proveedores y los riesgos vigentes.

## Controles explícitos

`scripts/release/candidate-evidence-lib.mjs` exige:

- `profile=public`, `schemaVersion=1` y el mismo **SHA de 40 hex** en
  `RELEASE_EXPECTED_SOURCE_SHA`, `git rev-parse HEAD` y el documento;
- árbol Git limpio; un artefacto fabricado desde archivos sin commitear no
  puede afirmar la identidad del commit;
- **19 gates definidos** en código, todos con `status=PASS`, `sourceSha`
  igual al candidato, `checkedAt` UTC válido y `reference` HTTPS
  no secreta; rechaza gates de nombre desconocido;
- referencias sin credenciales, query string, fragmentos ni controles de
  línea, y cuyo contenido **jamás aparece en stdout**;
- policy exacta de `node-forge@1.4.0 / CVE-2026-85393`, dos parents de
  Expo revisados y lista de excepciones pnpm idéntica;
- `HOLD` **24 horas antes de la expiración** para revisión de owner
  (aun si el policy actual todavía no venció), y otro HOLD una vez
  vencida. No prorroga excepciones, no cambia thresholds de auditoría;
- errores de reloj, fechas futuras, versión de schema, archivo inexistente
  y datos no válidos generan HOLD.

El checker previo
`scripts/security/check-audit-exceptions.mjs` continúa siendo la
autoridad de validación de la estructura del lockfile/transitividad.
El nuevo checker **no** lo sustituye: sólo compara policy declarada y
su vencimiento al evaluar el acta.

## Uso cuando se autorice la validación conjunta

Este bloque **no ejecutó** los comandos. Preparar una revisión real:

1. Congelar el SHA exacto de `main` después de integrar los carriles.
2. Ejecutar `pnpm check`, `pnpm audit:prod`,
   `pnpm security:audit-exceptions`, QA de dispositivos y evidencia
   de despliegue Web/API en los entornos correspondientes, según los
   runbooks existentes.
3. Completar el acta *externa*, fuera del repositorio y de los folders
   sincronizados al Git. La evidencia real puede residir en el sistema
   de CI o en el gestor corporativo, siempre sin tokens en el enlace.
4. Invocar en un checkout **limpio** del mismo SHA:

```bash
export RELEASE_EXPECTED_SOURCE_SHA="<exact-40-hex-from-main>"
export RELEASE_CANDIDATE_EVIDENCE_FILE="/srv/losapuntes-evidence/candidate-public.json"
node scripts/release/check-candidate-evidence.mjs
```

La ruta del JSON debe ser absoluta, apuntar a un archivo regular,
situarse **fuera del repositorio** incluso tras resolver symlinks y
ocupar como máximo 128 KiB. El programa no realiza llamadas de red,
deployments, mutaciones de bases de datos, Docker ni escritura de archivos.

Esquema de cada acta externa (ejemplo deliberadamente **incompleto**):

```json
{
  "schemaVersion": 1,
  "profile": "public",
  "sourceSha": "<exact-SHA>",
  "gates": {
    "exactHeadQuality": {
      "status": "PENDING",
      "sourceSha": "<exact-SHA>",
      "checkedAt": "2026-10-14T00:00:00.000Z",
      "reference": "https://github.com/Enzopinotti/losApuntes/actions"
    }
  }
}
```

Este ejemplo produce `HOLD` a propósito. Los gates completos se pueden
listar sin ejecutar el CLI, leyendo `CANDIDATE_REQUIRED_GATES` en
`scripts/release/candidate-evidence-lib.mjs`.

### Gates incluidos

- calidad sobre SHA exacto, audit de dependencias, contrato de excepción,
  límite de dependencias API y runtime smoke;
- calificación Web/API live, rollback hot-cache, ingress, email/Google,
  gestión/rotación de secretos;
- backup off-host, restore aislado, scanner real, alertas con on-call;
- política legal/privacidad/soporte, instalación Android+iOS y QA real
  de accesibilidad.

Una capacidad de Google deshabilitada debe tener una **verificación real
y revisada** de que efectivamente está deshabilitada. No alcanza escribir
`NOT_APPLICABLE`; el script sólo acepta `PASS` con evidencia pertinente.
Una Beta de alcance reducido requiere política explícita distinta antes
de relajar gates: el preflight v1 modela **solo el perfil público**.

## Contrato de salida

```json
{
  "event": "release.candidate_evidence.preflight",
  "status": "HOLD",
  "reasonCodes": ["GATE_backupOffHost_NOT_PASS"]
}
```

La salida concreta incluye sólo códigos sanitizados, SHA y conteos
de gates. **No** contiene el contenido del archivo, URLs de evidencia,
datos de cuentas, proveedor, passwords ni secrets.

`REVIEW_REQUIRED` no implica CI GREEN, despliegue, auditoría limpia,
dispositivos aceptados ni publicación aprobada. Una persona debe revisar
la evidencia y firmar la decisión canónica en
[release-evidence.md](./release-evidence.md).

## Pruebas nuevas, pendientes de ejecutar

`scripts/release/candidate-evidence-lib.test.mjs` escribe once
casos de contrato: acta completa no equivale a GO, gates faltantes,
perfil inválido, SHA/worktree, timestamp falso/futuro, referencia
con tokens, deadline próximo/vencido, policy alterada, ignore list
cambiada, documento malformado y garantías estáticas del CLI.

Cuando se abra el gate conjunto:
```bash
node --test scripts/release/candidate-evidence-lib.test.mjs
```

Este script es independiente de `package.json` para evitar colisionar
con el PR #230 que modifica el workspace. Se incorporará al gate
reproducible sólo después de reconciliar los carriles y revisar su
futura interacción con el Quality Gate; no atribuirle test green ahora.

## Riesgos abiertos y decisiones externas

- [#133](https://github.com/Enzopinotti/losApuntes/issues/133):
  la excepción de `node-forge` vence **2026-10-15T00:00:00Z**.
  El preflight **rechazará** cualquier acta dentro de la ventana final
  de 24 horas o vencida hasta que se resuelva el riesgo por el proceso
  de seguridad. No eludir modificando relojes o valores del acta.
- [#141](https://github.com/Enzopinotti/losApuntes/issues/141):
  el advisory de `braces@3.0.3` sigue abierto sin patched version
  documentada. El preflight necesita un PASS legítimo de
  `productionDependencyAudit`; no genera ese PASS por sí solo.
- [#83](https://github.com/Enzopinotti/losApuntes/issues/83),
  [#48](https://github.com/Enzopinotti/losApuntes/issues/48),
  [#100](https://github.com/Enzopinotti/losApuntes/issues/100):
  evidencia real Web/API/ingress y proveedores, restauración y dispositivos
  continúa siendo trabajo de implementación/deployment/operación externo.

**Política de este carrier:** commits atómicos `[skip ci]`, PR sin squash,
no CI/tests/builds/QA. Estado al fusionar: **INTEGRADO / NO VALIDADO**.
