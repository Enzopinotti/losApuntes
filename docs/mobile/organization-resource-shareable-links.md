# Mobile — compartir Recursos destacados de una Organización

**Alcance:** MOB-035. El detalle de una organización agrega **Compartir enlace** junto a cada recurso destacado que ya muestra.

La acción sólo está disponible en la proyección de organización de la sesión autenticada, con la pantalla enfocada y la app en foreground. Abrir el detalle y compartir son acciones separadas. El menú nativo recibe el título visible y `losapuntes:///resources/<uuid-v4>`; abrir ese localizador vuelve a cargar el recurso y la API decide acceso con la sesión actual. No se comparte URL firmada ni autorización.

`apps/mobile/test/organization-featured-resource-share.test.ts` verifica la autoridad activa y que abrir y compartir se mantengan como acciones hermanas.

No cambia visibilidad de la organización, membresía, selección de recursos destacados, carga ni persistencia. La aceptación en dispositivos sigue pendiente: sesión activa/expirada, cancelar/completar menú, volver del detalle y lector de pantalla.
