# Observabilidad Web — conservar el ciclo nativo de errores

**Alcance:** corrección aislada del observador global de la app Web. No cambia autenticación, permisos, endpoints ni metadatos del sobre privado.

## Problema

Los listeners `error` y `unhandledrejection` capturaban una incidencia para telemetría y luego ejecutaban `preventDefault()`. Ese comportamiento podía impedir el tratamiento normal del navegador para errores y promesas rechazadas sin consumidor, incluso cuando el reporte fallaba. La observabilidad debe *observar* el error, no asumir que lo resolvió.

## Semántica aplicada

- Los eventos se reportan usando el sobre de diagnóstico que ya elimina mensajes, stack e identificadores sensibles.
- El listener **nunca cancela** el manejo por defecto del evento, ni en éxito ni ante un fallo del sink.
- Un proveedor de telemetría que lanza una excepción no rompe el listener ni impide a otras herramientas recibir el evento original.
- Si falla el segundo `addEventListener`, se intenta eliminar ambos listeners para no dejar un observador parcial.
- Al desmontar, ambos `removeEventListener` se intentan de forma independiente; la limpieza es idempotente incluso si un target externo arroja errores.

El handler global sólo procesa eventos del target recibido. No instala un gestor de errores alternativo y no reemplaza el `WebErrorBoundary` de React; el fallback visible y su botón de recarga siguen intactos.

## Pruebas

`pnpm test:web-observability-contract` amplía la cobertura del contrato previo de privacidad de la siguiente manera:

- recepción del error y del rechazo, sin cancelar sus eventos nativos;
- fallo sincrónico del reportador sin impedir la propagación original;
- fallo de registro del segundo listener con reversión del primero;
- fallo al eliminar el primer listener sin impedir la eliminación del segundo;
- desinstalación repetida sin efectos secundarios.

## Evidencia pendiente

Se requiere `pnpm check` y verificación de navegador en el HEAD exacto antes de fusionar. Las pruebas de unidad con target simulado no demuestran por sí solas el comportamiento de consola en todos los navegadores. El bloqueo de seguridad Expo/Metro por `braces` (#141) permanece independiente y **no** se exceptúa ni se enmascara.
