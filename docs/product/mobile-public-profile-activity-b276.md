# B276 — Actividad pública detallada tras integrar avatar y perfiles

## Reconciliación del conflicto
La PR #742, base `main@ebeea432`, añadió tarjetas con tipo/descripcion/fechas para `profile.activities`, pero no incluyó el avatar que se fusionó después mediante #741 (merge `d497cda8ce23633fd1e20cf9c2c4c09fe96b5f48`). Su combinación directa ahora provoca un conflicto en `search-result-screens.tsx`. B276 parte del `main` posterior a #741 y lleva la funcionalidad de #742 **sin descartar** avatar, Share, intereses, idiomas ni trayectoria académica.

## Contrato funcional
- Solo actividades publicadas y autorizadas por `data.profile.activities`; ninguna consulta al perfil privado.
- Título accesible, tipo humano (cinco categorías), descripción en texto plano y rango de fechas civiles/ausentes (sin conversión horaria).
- Mantiene `activitiesNextCursor` como aviso de que hay más, pero sin inventar paginación ni endpoints todavía no integrados.
- Helper de presentación, test unitario y screen contract byte idénticos a #742. UI transplantada quirúrgicamente sobre pantalla del `main` actual, preservando encabezado de avatar B273 y acciones previas.
- Sin cambios API/Auth, permisos, rutas, DB, flags, dependencia/lockfile o controles de seguridad.

## Aceptación técnica
Node 24 + pnpm 9 frozen, Mobile tests, TypeScript, ESLint, Prettier pinned, Expo Android+iOS export, Quality Gate y 10 dominios críticos, smoke Mongo runtime tras #740, audit HIGH exact-head. Las vulnerabilidades heredadas #133 y #705 permanecen release HOLD. Ningún merge de código significa autorizar despliegue.

#742 se cierra después de registrar este replacement, sin fusionar su árbol obsoleto. Fuente histórica funcional #621 permanece para futura integración independiente de paginación/URLs.
