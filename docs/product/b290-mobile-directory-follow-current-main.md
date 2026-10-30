# B290 — Seguir organizaciones directamente desde el directorio Mobile

**Fecha:** 2026-10-30. **Base:** `main@e401dc21e88d3d7e9e3fe2fd082ae9b21ed7a9f4`. Reconciliación funcional del carril histórico #650, sin incorporar su stack antiguo.

## Experiencia

Cada fila del directorio Mobile incluye un botón separado de la acción «Ver organización»: Seguir o Dejar de seguir. El lector de pantalla recibe el nombre de la organización y el estado de ocupación/deshabilitado. El botón tiene un objetivo táctil de 46 puntos y presenta mensajes de éxito o error de forma accesible.

## Integridad de estado

- `MobileOrganizationsDirectoryController.toggleFollow` actualiza el estado de la tarjeta únicamente tras respuesta confirmada de follow/unfollow.
- Ante offline, timeout o fallo ambiguo del servidor, consulta una sola vez el detalle para comprobar `viewer.following`. **Nunca reenvía automáticamente una escritura** con resultado incierto.
- Estado y operaciones aislados por `authorityKey`; un cambio de sesión, filtro o perfil aborta y descarta respuestas anteriores.
- Mientras se procesa la mutación, no lanza otro follow ni pagina en paralelo. Conservar el directorio con búsqueda institucional, prevención de ciclos y avatares públicos B281/B284.
- No altera APIs, permisos, datos privados, lockfile, dependencias ni feature flags.

## Verificación

Pruebas del controlador: ACK follow/unfollow, timeout reconciliado sin reintento de escritura, respuesta tardía después de cambiar de sesión. Contrato Web+Mobile confirma botones no anidados, llamadas al controlador y que sobreviven el filtro institucional y las imágenes públicas.

Ejecutar Node24/pnpm9 frozen, pruebas Mobile, TypeScript/Prettier/lint, Expo iOS/Android, Quality Gate, 10 críticos, runtime smoke y auditoría HIGH en el HEAD de la PR. La auditoría productiva permanece fallando por node-forge #133 y Zod #705; release #353 HOLD.