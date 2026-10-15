# Descubrir → Guardar → Retomar (Web)

**Producto:** Los Apuntes 2026 · **Alcance:** interfaz de búsqueda pública y guardado autenticado de recursos ya existentes.

## Recorrido del estudiante

1. Buscar por término y, opcionalmente, materia actual en `/search`. Abrir el detalle o pulsar **Guardar apunte** directamente desde el resultado.
2. Si la persona no tiene sesión, ver **Iniciá sesión para guardar** en lugar de intentar un guardado anónimo.
3. Guardado autorizado: `PUT /resources/:id/save` con cookies de sesión, `cache: no-store`, timeout y `AbortSignal` existentes. Sólo una respuesta `{ saved: true }` confirma el cambio.
4. Al confirmar, ofrecer **Ver mis guardados**. La ruta `/resources?view=saved` activa la biblioteca de guardados sin necesidad de otro clic y sobrevive recargas.
5. Si la conexión se corta o el servidor responde 5xx, **no afirmar éxito**: mostrar un estado incierto con enlace **Revisar guardados**, sin reintentar automáticamente el PUT.
6. Si existe un error definitivo de acceso, sesión o validación, permitir un reintento manual con mensaje claro; nunca recuperar permisos a partir del estado de la interfaz.
7. El recurso abierto desde Search conserva `searchReturnTo` con término, scope y `subjectId` canónico. **Volver a la búsqueda** restaura los mismos parámetros; no se codifican nombres privados, tokens ni información de una sesión en los enlaces.

## Límites y seguridad

- Se reutiliza la API y su política de autorización. El hecho de conocer un ID o tener un enlace no concede lectura ni guardado.
- El estado local del botón está cercado por `status:userId:sessionId:resourceId`. Tras cambio de cuenta, ruta o desmontaje, respuestas antiguas no pueden declarar éxito en otra sesión.
- No se persisten resultados, estado de guardado ni datos privados en localStorage o sessionStorage.
- El botón solo controla **guardar**: no hace borrados silenciosos ni alterna un estado de pertenencia inferido. Las eliminaciones siguen disponibles en la biblioteca existente.
- El menú de guardados es una vista derivada de `?view=saved`, no de una bandera en memoria, para soportar compartir/recargar sin reutilizar la búsqueda previa.

## Pruebas automáticas

`node scripts/test-web-search-quick-save-contract.mjs` valida la clasificación de resultados ambiguos, aislamiento y confirmación, el endpoint existente, el vínculo a la biblioteca, controles de interfaz, recuperación de la materia y ausencia de almacenamiento privado.

`node scripts/test-web-search-contract.mjs` conserva los contratos de búsqueda y navegación ya integrados. El gate específico de Web valida Prettier, TypeScript y ambos tests en el SHA exacto.

### Aceptación pendiente (sin levantar la app)

- Buscador anónimo: solo entrada a login, sin mutación.
- Sesión válida: guardar y observar la biblioteca real sin recargar credenciales.
- Cambio de cuenta durante PUT; 401/403/404; corte de red justo después del commit; cambio de materia; Atrás/Adelante y recarga desde `/resources?view=saved`.
- Accesibilidad de estado, foco y tamaño táctil en navegadores móviles.

La aceptación real en navegador queda pendiente hasta la fase general de pruebas solicitada.
