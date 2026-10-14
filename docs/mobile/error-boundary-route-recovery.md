# Mobile — recuperación del error boundary al navegar

**Estado:** corrección del contrato de estados degradados de Mobile (MOB-FR-008, NFR-UX-001; seguimiento #85). No cambia Auth, permisos, backend ni telemetría.

## Problema

El `MobileObservabilityRoot` contiene un `MobileErrorBoundary` persistente para toda la navegación. Si una ruta lanza un error durante render, la pantalla de recuperación tapa el contenido. El botón **Intentar de nuevo** ya permite reintentar esa ruta, pero una navegación posterior (por ejemplo, un deep link hacia otra pantalla) no debe heredar la falla anterior.

## Comportamiento

- El boundary observa únicamente el `pathname` actual de Expo Router como `resetRouteKey`, sin parámetros de consulta, fragmentos o tokens.
- Un cambio efectivo de ruta limpia el estado fallido y deja montar la nueva pantalla. No se usa `key` para desmontar el root ni reinstalar la captura global de excepciones.
- Un nuevo render en la **misma ruta** no limpia el fallo: evita un bucle de errores repetidos; el reintento permanece explícito.
- Navegar al detalle de otro recurso (mismo patrón de pantalla pero distinto pathname) es una navegación nueva, y debe reautorizar sus datos como siempre.
- El diagnóstico sigue publicando únicamente clase de error y superficie normalizada; el `pathname` concreto usado para comparar rutas queda en memoria local del boundary y no se agrega al envelope.

## Validación y límites

`apps/mobile/test/mobile-error-boundary-recovery.test.ts` verifica re-render de la misma ruta, transición desde fallo hacia otra ruta y navegación normal sin fallos.

Esta cobertura es lógica determinista. La aceptación de navegación por deep link, focus/VoiceOver/TalkBack y recuperación tras errores de render en un dispositivo iOS/Android real sigue siendo parte de #85/#7; el test no se presenta como esa evidencia externa. No se añaden dependencias ni cambios de esquema/contrato.
