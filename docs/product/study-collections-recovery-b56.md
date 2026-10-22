# B56 — Diagnóstico y limpieza segura de Colecciones sincronizadas

## Objetivo

Una colección persistente puede conservar referencias a apuntes cuya
visibilidad cambió o que ya no existen. El API devuelve
`{resourceId, resource: null}` para esas referencias sin divulgar metadatos.
B56 convierte esa protección en una herramienta utilizable desde
`/study-collections/recovery`, visible en el menú de usuarios solo cuando
el feature flag de Colecciones está activado.

## Experiencia

1. Elegir una Colección propia de la lista paginada o entrar con
   `?collection=UUIDv4`.
2. **Analizar referencias**: lectura paginada de los hasta 100 IDs. Muestra
   accesibles y referencias sin acceso confirmado. No escribe nada.
3. Solo si el recorrido terminó con integridad, ofrecer la acción
   **Quitar referencias sin acceso**, con confirmación explícita.
4. Antes de **cada** baja, comprobar la revisión actual de la colección y
   volver a consultar el apunte original. Si volvió a estar accesible,
   **preservar la referencia**. Si el GET devuelve 403/404, se puede borrar
   **solo el vínculo** por el endpoint existente.
5. Informar cantidad quitada/restaurada y el estado parcial ante fallos.
   Si cambió la revisión o falló una lectura, detenerse y exigir un
   análisis nuevo. No se hace un reintento destructivo automático.

## Protecciones

- Doble autoridad: `PrivateRoute` y frontend flag para descubrimiento;
  backend `AuthSessionGuard` y `StudyCollectionsFeatureGuard` con
  búsqueda por propietario para todas las operaciones.
- Se ignoran respuestas tardías de cuenta, sesión o colección anteriores
  mediante `useAsyncAuthorityFence`.
- Recorrido acotado a cuatro páginas de 25 elementos. No se confirma
  una inspección con IDs duplicados, contadores incompletos, bucles de
  cursor ni revisión distinta entre encabezado, páginas y cierre.
- Ninguna acción descarga recursos, cambia permisos ni elimina apuntes
  originales. Se utiliza `DELETE /study-collections/:id/resources/:resourceId`
  únicamente cuando el GET individual todavía devuelve 403/404.
- Los cambios concurrentes, incluyendo los del propio propietario desde
  otra pestaña, interrumpen una limpieza antes de continuar.
- Si se cortó la conexión tras una baja que pudo confirmarse en Mongo,
  no se presupone su resultado: se obliga a volver a analizar.
- No persiste diagnósticos en localStorage/sessionStorage; no incluye
  contenido o nombres de apuntes inaccesibles.
- **Actualización B57:** la recuperación envía
  `expectedRevision` en cada DELETE. El servidor vuelve a comprobar
  propietario y acceso; Mongo exige la revisión en la misma transacción.
  Si otro dispositivo modificó la colección entre el GET y el DELETE,
  responde 409 y no borra la referencia.
- **Límite restante:** un cambio de visibilidad del propio Resource entre
  el chequeo del backend y la escritura de la Colección todavía puede
  competir; las dos entidades no comparten una precondición atómica de
  autorización. Sigue requiriéndose confirmación y no existe auto-limpieza.

## QA y publicación

```bash
node scripts/test-study-collections-recovery-b56.mjs
node scripts/test-study-collections-recovery-b56-integration.mjs
pnpm --filter @losapuntes/web check:types
pnpm --filter @losapuntes/web build
```

En un entorno con `STUDY_COLLECTIONS_ENABLED=true` y
`VITE_STUDY_COLLECTIONS_ENABLED=true`, probar dos sesiones del mismo
usuario, un usuario ajeno, cambios concurrentes, 100 referencias, corte de
conexión tras un DELETE y permisos restaurados. La aceptación real Mongo
B50–B54, exportaciones v1/v2 y offboarding siguen siendo gates necesarios.

**Estado inicial:** feature apagado por defecto, sin habilitación de
producción, cambios de Mongo ni CI. La entrega añade pantalla, modelo
puro, tipos TypeScript, regresiones y documentación, no certificación E2E.
