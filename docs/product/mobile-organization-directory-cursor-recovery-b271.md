# Recuperación de cursores en el directorio de organizaciones Mobile (B271)

**Fecha:** 22 de octubre de 2026. **Base:** `main@e9050c00`. **Alcance:**
directorio de organizaciones de Mobile.

## Problema

El directorio deduplicaba organizaciones por ID, pero no detectaba cursores
repetidos. Una respuesta circular dejaba visible «Cargar más» y podía consultar
la misma página reiteradamente.

## Comportamiento

- Cada lectura nueva con los filtros actuales comienza una cadena nueva.
- El controlador registra cursores de páginas completadas. Si la respuesta
  apunta al cursor actual o a uno ya usado, incorpora las organizaciones
  recibidas, deduplica por ID y termina la paginación.
- La pantalla informa el problema de forma accesible y permite actualizar el
  directorio.
- Las fallas temporales conservan el cursor y las filas cargadas para reintentar.
- La invalidación limpia el historial de cursores.

## Validación

- `organizations-controller.test.ts`: ciclo A→B→A, actualización de la lista y
  reintento tras una falla de página.
- `tsc -p apps/mobile/tsconfig.json --pretty false`.
- Prettier, higiene del repositorio y `git diff --check`.
