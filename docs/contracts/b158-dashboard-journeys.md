# B158 — Dashboard Web de acciones académicas

**Fecha:** 2026-10-20. **Base:** `main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9`.

## Problema

El dashboard privado era una página provisional de enlaces y un mensaje antiguo que decía que el onboarding “va a completar” la universidad, la carrera y las materias. El producto ya tiene pantalla de perfil, trayectoria, feeds, estudio, kits portátiles, búsqueda, recursos y preguntas, pero esta puerta de entrada no las ordenaba por intención de uso.

## Funcionalidad B158

- Una portada privada **de cuatro recorridos**: Estudiar, Buscar y aportar, Mi comunidad, Mi trayectoria y cuenta. Cada recorrido dispone de tres acciones con nombres, descripciones y destinos existentes.
- Un buscador compacto con submit explícito; reutiliza la validación `searchSelectionHref` de la búsqueda existente. No envía los borradores al servidor, no registra eventos y no usa localStorage/sessionStorage. Rechaza valores vacíos, menores de 2, mayores de 120 caracteres o con caracteres de control.
- Las acciones apuntan exclusivamente a rutas canónicas existentes en `routes.tsx`. Ningún endpoint nuevo, duplicación de permisos, dato privado de terceros ni estado de progreso inventado es necesario. Los controles de acceso se aplican en la ruta de destino.
- No se enlazan áreas internas del piloto ni colecciones persistentes con flag apagado. Las colecciones **portátiles locales** se describen expresamente como tales.
- Las opciones son botones nativos `aria-pressed` y el buscador usa `role=search`, etiquetas, descripción del campo, alertas de error; diseño responsivo con control de foco, objetivos táctiles de 44 px y preferencia de movimiento reducido.
- Se evita un contador de rachas, tiempo de pantalla y feeds infinitos. Se mantiene la filosofía de avance académico con tareas finitas.

## Aceptación y regresiones

`scripts/test-web-dashboard-b158.test.mjs` comprueba: cuatro recorridos, 12 enlaces únicos hacia rutas declaradas, ausencia de funciones no habilitadas, URLs de búsqueda canónicas y sanitizadas, elementos de accesibilidad y la inexistencia de persistencia de borradores. El nuevo script `test:web-dashboard-b158` forma parte del `pnpm check` obligatorio.

El workflow focalizado B158 usa Node24, pnpm9 con lockfile frozen, prueba de contrato, TypeScript, ESLint estricto, Prettier y build de producción sobre HEAD exacto y sin publicar artefactos. CI general sigue disponible por PR.

## Límites y release

Este bloque no toca API, base de datos, contratos HTTP, roles, auth, dependencias, Mobile, flags, lockfile ni la configuración de despliegue. El proceso de PR permanece en Draft mientras `Production dependency audit` siga fallando por #133/#141. Ni este dashboard ni una CI focalizada verde habilitan por sí solos la release #353. Deben mantenerse el gate global y la aceptación real.
