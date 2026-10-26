# Recuperación de cursores en la biblioteca de recursos propios Mobile (B272)

**Fecha:** 22 de octubre de 2026. **Base:** `main@e9050c00`. **Alcance:**
publicaciones propias con filtros de visibilidad, materia, búsqueda y orden.

## Problema

La biblioteca deduplicaba recursos repetidos entre páginas, pero aceptaba un
cursor que se repitiera. Si el servidor devolvía una página circular, el botón
de continuar seguía disponible y podía volver a solicitarla sin límite.

## Comportamiento

- Cada lectura nueva con sus filtros inicia una cadena de cursores nueva.
- El controlador registra cursores de páginas completadas; si aparece uno ya
  usado, conserva los recursos recibidos y termina la paginación.
- La pantalla informa el cursor repetido de forma accesible y permite actualizar
  la lista con los mismos filtros.
- Una falla temporal no consume el cursor, por lo que la página sigue siendo
  reintentable.
- Invalidar o suspender la autoridad limpia el historial de cursores.

## Validación

- `resource-owned-controller.test.ts`: ciclo A→B→A y reinicio al volver a cargar
  con los mismos filtros.
- `tsc -p apps/mobile/tsconfig.json --pretty false`.
- Prettier, higiene del repositorio y `git diff --check`.
