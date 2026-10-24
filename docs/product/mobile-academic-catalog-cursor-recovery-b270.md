# Recuperación de cursores en el catálogo académico Mobile (B270)

**Fecha:** 22 de octubre de 2026. **Base:** `main@e9050c00`. **Alcance:**
búsqueda paginada de instituciones, carreras y materias durante onboarding.

## Problema

La búsqueda deduplicaba resultados por ID, pero no comprobaba que el cursor
avanzara. Si una página devolvía el cursor actual o uno ya solicitado, el
catálogo seguía ofreciendo la misma página.

## Comportamiento

- Cada consulta comienza una cadena de cursores nueva.
- El controlador registra cursores de páginas completadas y detiene la cadena
  ante un cursor repetido, manteniendo los resultados válidos ya recibidos.
- La pantalla muestra un aviso accesible y ofrece volver a ejecutar la consulta.
- Una falla temporal conserva el cursor para reintentar la página pendiente.
- Cambiar la autoridad invalida la búsqueda y su historial.

## Validación

- `academic-onboarding-controller.test.ts`: ciclo A→B→A, reinicio de consulta y
  reintento tras una página fallida.
- `tsc -p apps/mobile/tsconfig.json --pretty false`.
- Prettier, higiene del repositorio y `git diff --check`.
