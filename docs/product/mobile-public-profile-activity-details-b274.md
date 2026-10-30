# B274 — Actividad pública legible en perfil Mobile

## Problema
El API ya proyecta tipo, descripción y fechas de cada actividad autorizada en `profile.activities`, pero el perfil Mobile integrado solo muestra título y aviso de cursor siguiente. La histórica #621 implementó presentación más rica sobre un componente de paginación que aún no vive en `main`.

## Reconciliación
Esta rama introduce únicamente el helper `publicProfileActivityPresentation` y lo utiliza en la pantalla **actual** de perfiles. No arrastra la antigua infraestructura de paginación #619 ni la ruta de transporte asociada; conserva exactamente el mensaje de `activitiesNextCursor` y el límite de la primera tanda.

- Los cinco tipos se traducen al español: proyecto, investigación, club, voluntariado, trabajo académico.
- Fecha civil completa, inicio/fin parcial o ausencia de fechas se muestran sin convertir zonas horarias ni inferir formatos.
- Título es encabezado accesible, descripción queda en texto plano (no HTML ni URLs automáticas).
- Se muestran solo actividades suministradas por la proyección pública de ese perfil; ninguna consulta privada ni inferencia de datos ocultos.
- Mantiene compartir perfil e intereses/idiomas de #736 y #739; evitar sobrescribir la cabecera de avatar pendiente B273/#741.

## Pruebas y aceptación
Helper y pruebas trasladadas de #621, prueba de estructura adaptada a la pantalla real de `main`. Validar Node24/pnpm9 frozen, Mobile tests, TypeScript/ESLint/Prettier, Expo iOS+Android, Quality Gate y 10 coberturas, runtime y auditoría HIGH exact-head.

No cambia API/Auth, rutas, autoridad, DB, dependencias, lockfile ni flags. La corrección del kernel CI de Mongo está incorporada en #740. Los problemas HIGH de supply chain #133/#705 siguen como release HOLD; integrar funcionalidad no autoriza un despliegue.
