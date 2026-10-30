# B271 — Intereses e idiomas públicos en perfiles Mobile

## Producto y privacidad
Se recupera el alcance independiente de la PR histórica #626. El endpoint de perfil público ya devuelve, cuando el servidor los autoriza, `profile.skills.skills`, `profile.skills.interests` y `profile.skills.languages`. Hasta esta rama, Mobile sólo presentaba las habilidades.

- Mostrar **Intereses** e **Idiomas** únicamente si están incluidos en `profile.skills` y la lista no está vacía.
- Mantener las habilidades existentes y sus etiquetas; el orden se conserva dentro del bloque público de skills.
- No intentar consultar perfiles privados, reconstruir preferencias ocultas, completar campos omitidos ni inferir idioma por configuración del dispositivo.
- Listas vacías/ausentes no crean filas ni tarjetas vacías.
- Sin cambios de API/Auth/Mongo, contratos, permisos, persistencia, dependencias ni lockfile.

## Integración atómica
1. UI en la pantalla `PublicProfileScreen` actual, solamente dos bloques de texto condicional.
2. Prueba contractual de presencia condicionada al objeto `skills` del servidor.
3. Esta nota de aceptación y trazabilidad de #626. No importar el resto de la rama histórica.

Los cambios están en el mismo archivo de vista usado por el carrier B270 (#738) pero en un hunk distinto; antes de integrar cualquiera de ambos comprobar main actualizado y tests combinados para evitar sobrescribir avatar o intereses.

## Validación
Mobile tests, Node24/pnpm9 frozen, tipos, lint, formato, exportaciones Expo Android/iOS, Quality Gate y coberturas críticas, runtime smoke y production audit exact-head. **DRAFT/HOLD** si #133 node-forge o #705 Zod siguen con HIGH. Sin bypass ni aprobación artificial de release.
