# B173 — Ensayo de integración de seis PRs (solo lectura)

**Fecha:** 21 de octubre de 2026. **Base inmutable:** `main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9`.

## Problema

Los PRs validados individualmente siguen Draft sin fusionar debido al bloqueo de seguridad global. Esa situación oculta riesgos de integración: los PRs #487, #501 y #503 modifican `package.json` para añadir cada uno un test dentro del comando raíz. Integrar solamente por orden de llegada puede perder un test sin que la calidad del PR individual lo descubra. Además, B156 corrige en un PR distinto el kernel del smoke Mongo, y B164 corrige otras vulnerabilidades sin remediar aún las GHSA upstream.

## Candidatos exactos

| PR | HEAD fijado | Área |
| --- | --- | --- |
| #484 | `9a24bfa92410835f04af1122d10a6fc4df934660` | Mongo8 / runner de smoke |
| #495 | `b12c23bed5045d652391ac463bc857c15e7d1130` | follow-redirects 1.16.1 |
| #487 | `da7c78b1ed91207cc19a0dd25ca1154a5d39099c` | Dashboard académico |
| #493 | `74ee65199f9819a8d44860ffaad0613f172ee768` | Rutas inexistentes |
| #501 | `8b6aa2a56f59573f1d194a0758ba6530c508699b` | Modo Enfoque |
| #503 | `4e7ac9ab72367366b86b8fba31afd33f8ed796bc` | Atribución de apuntes |

La lista exacta y el orden son parte del contrato en `scripts/ci/b173-candidates.json`. **Si main o cualquiera de esas ramas avanza, el ensayo falla antes de fusionar**: jamás se reconstruye silenciosamente un candidato con otro SHA.

## Cómo funciona

1. GitHub Actions hace checkout sin credenciales persistentes, con `contents: read`, sobre el HEAD exacto del PR B173. Verifica SHA y working tree limpio.
2. `b173-compose-candidates.mjs` comprueba `ls-remote` de main y de las seis ramas; exige que cada SHA coincida exactamente con el manifiesto y comparta la base aprobada.
3. Genera un **worktree temporal y desacoplado**, mezcla allí cada HEAD mediante merges `--no-ff` locales con nombre de actor efímero. No ejecuta `git push`, no abre PRs adicionales, no altera la rama fuente y no llama a deploy.
4. Si aparece conflicto, la resolución automatizada está **restringida a `package.json` y solo en PRs que agregan tests independientes**. `b173-reconcile-package-scripts.mjs` valida por separado cada manifest contra el `package.json` original: metadata, dependencias, script de auditoría y todos los demás scripts deben ser idénticos. Solo añade las declaraciones nuevas y sus invocaciones al `pnpm test` existente; mantiene el orden original y ordena PRs por número si comparten la misma posición. Si detecta cambios arbitrarios, una eliminación, colisión, otro archivo o conflicto no reconocido: **FAIL CLOSED**.
5. Tras cada merge comprueba ancestralidad real del SHA incluido y tree limpio. Emite un SHA combinado **exclusivamente local** y lista los seis SHA de origen con el número de reconciliaciones. La identidad y fecha de los commits de ensayo están fijadas: los jobs deben informar `combinedSha` y `combinedTreeSha` idénticos para probar el mismo árbol verificado, sin publicarlo.
6. Jobs independientes del workflow: calidad completa del monorepo más tests y Chromium de Web, auditoría productiva real, y Mongo8/Compose/smokes HTTP sobre Ubuntu22.04 con preflight de kernel. Todos reinstalan desde lockfile congelado en worktree temporal, sin artifacts con código ni datos privados.

## Pruebas de seguridad del reconciliador

Las pruebas adversariales incluyen pérdida/reordenamiento de checks, mutación de `pnpm audit --prod --audit-level high`, cambios de dependencia o versionado, scripts ajenos, invocaciones extras, PRs duplicados, colisiones, determinismo y preservación de los comandos base. El job falla explícitamente en vez de elegir una preferencia no autorizada.

## Interpretación de resultados

Un `composed-quality: SUCCESS` acredita compatibilidad del conjunto probado, no seguridad total ni autorización. El job `composed-audit` permanece **FAIL** si el registro npm detecta vulnerabilidades HIGH activas, incluidas #133 (`node-forge`) y #141 (`braces`). El parche #495 solo elimina los dos altos `follow-redirects` en el candidato compuesto, si no aparecen nuevos avisos.

Un `composed-runtime: SUCCESS` acredita esa prueba de integración hospedada, no la compatibilidad del kernel productivo, ni validaciones de dispositivos reales, ni release. **#353 continúa HOLD** hasta la remediación real, CI global en el HEAD de la futura rama fusionada y aceptación de QA.

No hay push, merge remoto, publicación, waiver, override adicional, bypass de seguridad ni promesa de deploy. Los PRs originales siguen en Draft y se podrán reconciliar tras remediar los bloqueos reales, nunca por el mero éxito de B173.

## Riesgos y mantenimiento

El manifiesto fijado necesita actualización deliberada cuando se mueva main o un PR; esta rigidez es intencional. El orden incluye solo seis candidatos coordinados: otros PRs backend no forman parte de la evidencia. Los tres jobs replican la composición y por tanto consumen CI, pero producen resultados por SHA comparables, sin trabajo manual de fusión local ni cambios remotos. Se recomienda revisar sus resultados antes de decidir un orden futuro de PRs.