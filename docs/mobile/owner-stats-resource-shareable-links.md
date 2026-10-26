# Mobile — compartir desde Estadísticas de mis apuntes

**Alcance:** MOB-036. Cada recurso del ranking **Tus apuntes más guardados** ofrece **Compartir enlace** junto a **Abrir apunte**.

El ranking pertenece a la proyección del autor autenticado y sólo se muestra bajo autoridad vigente, con la pantalla enfocada y la app en foreground. Compartir no altera métricas ni modifica guardados o permisos. El menú nativo recibe el título visible y `losapuntes:///resources/<uuid-v4>`; al abrirlo, la API vuelve a comprobar sesión y acceso. No se comparten URLs firmadas ni grants.

`apps/mobile/test/owner-stats-resource-share.test.ts` comprueba que el enlace use los mismos IDs y títulos del snapshot autorizado y que abrir y compartir sean controles hermanos.

La aceptación del menú nativo y el regreso desde detalle siguen pendientes de prueba en dispositivos iOS y Android.
