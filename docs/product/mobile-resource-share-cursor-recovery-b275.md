# B275 — Recuperación de cursores en permisos de apuntes Mobile

## Problema

La lista paginada de personas con acceso a un apunte deduplicaba perfiles, pero no detenía un cursor repetido o un ciclo de páginas.

## Comportamiento

- El historial de páginas se limita al permiso, sesión, recurso y revisión actuales; la lista se reinicia con una actualización explícita o cambio de alcance.
- Una página que repite su cursor o vuelve a uno consumido conserva los permisos ya mostrados, detiene la paginación y presenta una alerta accesible con acceso a «Actualizar accesos».
- Los fallos de red no consumen el cursor y siguen siendo reintentables.
- No cambian la autoridad server-side del endpoint, la lista de destinatarios ni las operaciones de otorgar/revocar permisos.

## Evidencia local

- Pruebas del controlador para ciclos, conservación de accesos, bloqueo de más páginas, reinicio por actualización y reintento tras fallo transitorio.
- TypeScript de Mobile, Prettier, higiene del repositorio y `git diff --check`.
