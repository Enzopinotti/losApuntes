# Recuperación de cursores en actividades del perfil Mobile (B268)

**Fecha:** 22 de octubre de 2026. **Base:** `main@e9050c00`. **Alcance:**
paginación de actividades propias en el perfil Mobile.

## Problema

La lista de actividades deduplicaba elementos, pero confiaba en que cada página
avanzara el cursor. Una respuesta que devolviera el cursor actual o uno ya
solicitado dejaba disponible «Cargar más» y podía repetir indefinidamente la
misma solicitud.

## Comportamiento

- El controlador recuerda los cursores que completaron una solicitud durante
  la cadena actual.
- Si la página devuelve un cursor repetido, incorpora los elementos recibidos,
  deduplica por ID, termina la paginación y muestra un aviso accesible para
  actualizar el perfil.
- Una falla temporal no consume el cursor: los elementos anteriores y la
  página pendiente permanecen disponibles para reintentar.
- Una lectura nueva del perfil o la invalidación de la autoridad reinicia el
  historial de cursores.

## Validación

- `profile-controller.test.ts`: ciclo A→B→A, reinicio tras actualizar y
  reintento después de una falla de red.
- `tsc -p apps/mobile/tsconfig.json --pretty false`.
- Prettier, higiene del repositorio y `git diff --check`.
