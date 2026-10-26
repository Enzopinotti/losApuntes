# Compartir enlaces desde las bibliotecas de Mobile (MOB-033)

## Alcance

Agregar **Compartir enlace** en las filas visibles de **Recursos guardados** y **Mis apuntes**. Ambas acciones reutilizan el localizador nativo de recursos; no agregan rutas, persistencia ni permisos.

La acción se renderiza sólo cuando la pantalla conserva los elementos cargados bajo la autoridad de sesión vigente. Cada mensaje contiene el título mostrado y `losapuntes:///resources/<uuid-v4>`. El destinatario vuelve a cargar el detalle y la API decide el acceso con la sesión actual. El enlace no es una invitación ni una credencial.

En **Mis apuntes**, la acción comparte publicaciones propias disponibles y permanece separada del control para abrir y administrar. En **Recursos guardados**, compartir no modifica ni elimina el guardado. Ambos menús requieren una pulsación explícita.

## Seguridad y límites

No se comparten URL firmadas, tokens, grants, datos del usuario o contexto académico. Cambiar de cuenta, perder foco o invalidar la autoridad retira la biblioteca anterior de la pantalla; una URL ya compartida tampoco conserva autorización. Se usa el scheme de la aplicación; no se declara soporte universal ni associated domains.

## Cobertura

`apps/mobile/test/resource-libraries-share-action.test.ts` comprueba que ambas filas conecten la acción segura a los elementos visibles y que cada pantalla condicione sus datos a la autoridad vigente. Los contratos de payload y apertura siguen cubiertos por `apps/mobile/test/resource-share-link.test.ts`.

La aceptación de share sheet y navegación en dispositivos queda pendiente de pruebas con sesiones activa y caducada, cancelación/completado del menú, regreso desde el detalle y lector de pantalla.
