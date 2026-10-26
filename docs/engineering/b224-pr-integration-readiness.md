# B224 — Read-only preflight de PRs pendientes

## Problema

Los Apuntes tiene múltiples PRs independientes y apiladas. Que una PR sea `mergeable` en GitHub, tenga pruebas focalizadas verdes o haya pasado CI en un SHA histórico **no** significa que el candidato actual pueda fusionarse. En particular, los gates `Production dependency audit` y `Container runtime smoke` son obligatorios; las HIGH conocidas de #133 y #705 siguen bloqueando el release #353.

## Solución

`node scripts/pr-integration-readiness.mjs Enzopinotti/losApuntes <PR>` lee datos de GitHub con un token de solo lectura y devuelve JSON. **No escribe** en GitHub ni permite fusionar, desplegar o marcar una PR como aprobada. Verifica:

1. PR abierta, no Draft, destino `main`, mergeability `clean` y SHA base actual.
2. Inventario de checks suficiente y vinculado al SHA exacto de HEAD.
3. `Quality Gate`, auditoría de producción, contenedores y las diez coberturas críticas finalizados en verde; los resultados faltantes, pendientes o contradictorios bloquean.
4. Ausencia de carrera de HEAD/main entre el inicio y fin del preflight.

Si todo lo anterior se cumple, devuelve `CANDIDATE_FOR_HUMAN_REVIEW`: **no es una autorización de merge ni de release**. El integrador todavía debe revisar diff, conversaciones, dependencias con otras PRs, compatibilidad, permisos y evidencia post-merge. Cualquier consulta fallida devuelve `HOLD` y exit code no cero.

## Ejecución y pruebas

```bash
node --test scripts/tests/pr-integration-readiness.test.mjs
GITHUB_TOKEN="$GITHUB_TOKEN" node scripts/pr-integration-readiness.mjs Enzopinotti/losApuntes 666
```

Permisos de token: únicamente lectura de PRs, commits/checks y metadatos. No almacenar tokens ni pegar su contenido en comentarios. No hace falta configurar una GitHub Action con privilegios de escritura.

## Alcance y límites

- Bloque técnico de clasificación, sin cambio funcional al producto ni alteración de requisitos canónicos.
- No identifica por sí solo PRs stacked/superseded; la inspección humana es obligatoria.
- No repara las HIGH de `node-forge` ni `zod`, ni concede excepciones/waivers, ni modifica el lockfile o `.github/workflows/ci.yml`.
- No conviene usarlo para reconstruir un `main` virtual ni para sustituir `pnpm check`, `pnpm audit:prod` o los smokes reales del HEAD integrado.
- En 2026-10-25 el gate de seguridad sigue HOLD; la herramienta debe emitir HOLD para las PRs afectadas y no maquillar el resultado.
