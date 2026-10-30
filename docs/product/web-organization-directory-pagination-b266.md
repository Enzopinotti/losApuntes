# B266 — Directorio Web paginado y resistente a ciclos

Este bloque reconcilia sobre `main` las ideas de las PRs históricas #653 (paginación Web) y #662 (recuperación ante cursor repetido) sin importar ramas apiladas ni sobreescribir rutas actuales.

## Flujo

Al buscar organizaciones, la primera página usa el contrato de API existente (hasta 25 registros) y conserva el cursor opaco devuelto por el servidor. La persona puede pulsar **Cargar más organizaciones** para incorporar la siguiente página, sin infinite scroll ni precarga invasiva. La tanda conserva filtros de nombre y tipo y deduplica por ID estable.

La pantalla registra cada cursor solicitado dentro de un scope formado por sesión y filtros. Si el backend repite el cursor actual o retorna uno ya recorrido, mantiene los resultados recibidos, detiene únicamente la paginación del directorio y muestra un aviso con `role=alert`. Los errores HTTP/red permiten reintentar el mismo cursor sin perder los registros anteriores. Una búsqueda nueva reinicia el historial de cursores y descarta respuestas stale mediante `useAsyncAuthorityFence`.

## Criterios de aceptación

- Lista de más de 25 elementos cargable por acción explícita, sin cambiar orden ni tamaño del API.
- Duplicados de ID no duplican tarjetas; un registro actualizado no altera la posición ya establecida.
- Cursor repetido, ciclo de múltiples páginas y fin de lista (`null`) cubiertos en tests.
- Pulsaciones duplicadas protegidas con `paginationRequestRef`; errores transitorios no consumen el cursor.
- Scope de cuenta/sesión/filtros bloquea resultados antiguos; sin almacenamiento local ni permiso inferido.
- Botón con altura táctil mínima de 44 px, `aria-busy` y error anunciado.
- No cambia backend, permisos, certificados, motor de búsqueda o Mobile.

## Verificación y release

Pruebas `pnpm test:web-organizations-contract`, Web TypeScript, ESLint, Prettier y build. También permanecen requeridos los gates exact-head globales y el smoke de API real. La auditoría `pnpm audit:prod` sigue bloqueada por HIGH #133 y #705; el release #353 permanece HOLD. **No es evidencia de que producción esté aprobada.**
