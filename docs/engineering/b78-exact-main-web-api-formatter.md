# B78 — Restauración de Prettier Web/API sobre main actual

**Fecha:** 2026-10-16. **Base verificada:** `main@251a0ec96c6cf7491b354b90b54fff24f7833284` (B78 cola S3). Rama: `fix/b78-reformat-web-api-exact-main-20261016`.

## Motivo

`pnpm check` fallaba en el primer gate: Web tenía diez archivos sin formatear y API tenía varios archivos de exportación, estudio y configuración. Ya existían los PR #344 y #349, pero sus snapshots eran antiguos: varias pantallas y servicios habían cambiado después de esas ramas. Copiarlos directamente podía perder cambios funcionales.

## Procedimiento reproducible

1. Partir del SHA de `main` actualizado (sin copiar fuentes de PR antiguos).
2. Checkout exact-head Node 24/pnpm 9.15.9 con `pnpm install --frozen-lockfile`.
3. Ejecutar `pnpm --filter @losapuntes/web format` y `pnpm --filter @losapuntes/api format`, que invocan el Prettier fijado por el lockfile.
4. Validar `git diff --check` y que solo cambiaron `apps/web/src/**/*.{ts,tsx}` o `apps/api/{src,test}/**/*.ts`.
5. Publicar exclusivamente la actualización de estilo sobre `main` mediante `--force-with-lease` de **la rama temporal propia**; no actualizar `main`, no tocar ramas de los otros agentes.
6. Retirar el workflow temporal de la rama final, dejando una diferencia de archivos fuente solamente. Workflow temporal exitoso: [#38898339042](https://github.com/Enzopinotti/losApuntes/actions/runs/38898339042).

El resultado antes de este documento fue **1 commit ahead, 0 behind**, con **58 archivos TS/TSX**. Prettier no es un test de comportamiento: el PR debe pasar los gates completos sobre su SHA final.

## Integración concurrente

- El PR #374 conserva las correcciones funcionales CAS, exportación y progreso, pero proviene de un `main` anterior. Este PR **no incorpora ni reemplaza sus cambios funcionales**. Reconciliar #374 contra el formato final antes de fusionarlo.
- Los PR de estilo #344 y #349 son carriers históricos potencialmente reemplazables, pero **no cerrarlos sin validar esta CI exact-head y coordinar con los dueños**.
- No extender la excepción de `node-forge@1.4.0` (CVE-2026-85393; issue #133) automáticamente. Venció el 2026-10-15. La auditoría y la revisión de vulnerabilidades siguen obligatorias.
- No alterar `ACCOUNT_EXPORT_FORMAT_VERSION=1`, `STUDY_PROGRESS_ENABLED`, las reglas de ownership, los umbrales de checks, ni la release issue #353 (HOLD).

## Evidencia para cierre

- Comparar `main...head` y verificar que la diff contiene únicamente cambios de estilo y este documento.
- Confirmar `pnpm format:check` para Web y API, luego `lint`, `typecheck`, tests y build en exact-head CI.
- No afirmar CI global verde si hay fallos posteriores o auditoría de dependencias.
