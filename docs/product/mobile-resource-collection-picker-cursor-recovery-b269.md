# Recuperación de cursores en el selector de colecciones Mobile (B269)

**Fecha:** 22 de octubre de 2026. **Base:** `main@e9050c00`. **Alcance:**
selector de colecciones para guardar un apunte desde Mobile.

## Problema

El selector combinaba filas duplicadas por ID, pero seguía mostrando «Mostrar
más colecciones» cuando una página repetía el cursor actual o uno usado antes.
Eso podía solicitar sin fin una misma página y repintar el mismo conjunto.

## Comportamiento

- El controlador registra cursores de páginas completadas durante la apertura
  activa del selector.
- Si una página devuelve un cursor ya usado, conserva y combina sus colecciones,
  detiene la paginación y muestra un aviso accesible para cerrar y volver a
  abrir el selector.
- Las fallas de red no consumen el cursor: se pueden reintentar y conservan las
  filas cargadas.
- Abrir o cerrar el selector inicia una cadena nueva.

## Validación

- `resource-collection-picker-controller.test.ts`: ciclo A→B→A, reinicio al
  volver a abrir y reintento de una página fallida.
- `tsc -p apps/mobile/tsconfig.json --pretty false`.
- Prettier, higiene del repositorio y `git diff --check`.
