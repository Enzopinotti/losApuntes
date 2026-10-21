# B163 — Recuperación segura de rutas Web inexistentes

**20 de octubre de 2026** · base `main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9`.

## Incidente de UX

En el árbol React Router de `apps/web/src/app/routes.tsx` no había ruta comodín. Las URLs equivocadas o enlaces profundos obsoletos no contaban con un mensaje específico dentro del layout. No es un error de recursos/profiles existentes que devuelven 403/404 desde la API; es una ausencia de coincidencia de ruta en el navegador.

## Implementación

- Nuevo `NotFound.tsx` con encabezado semántico, mensaje accesible y enlaces `Link` internos al inicio y búsqueda. Para `status === "authenticated"`, aparece un acceso al panel, sin exponer enlaces privados a invitados ni mostrar datos de usuario.
- Un `{ path: "*", element: <NotFound /> }` **al final** de los hijos del layout raíz. React Router conserva prioridad para las rutas reconocidas, sus controles `PrivateRoute`, y los detalles `/resources/:resourceId` y `/p/:profileId` existentes.
- La vista **nunca** utiliza `useLocation`, `window.location` ni renderiza `pathname`/`search`/`hash`. Es una medida deliberada: enlaces viejos de recuperación/verificación podrían contener secretos o datos de terceros.
- No genera solicitudes adicionales, registra eventos, guarda información en storage ni ejecuta redirecciones implícitas. El usuario decide dónde continuar.
- SCSS propio con tamaño táctil ≥44px, foco visible, contraste, layout móvil y preferencia de movimiento reducido.

## Validación

- `scripts/test-web-navigation-contract.mjs` (parte del contrato global `pnpm check`) ahora exige el wildcard último, los tres destinos legítimos, la vista semántica y la ausencia de reflexión de tokens.
- `scripts/test-web-not-found-browser.mjs` levanta Vite en loopback con puerto fijo y API simulada estrictamente local, usando Chromium real. Verifica enlace profundo con token en ruta/query/hash sin fugas al texto visible, recuperación mediante búsqueda, Home válido sin interceptar, `/dashboard` protegido para invitado y acceso privado visible a una sesión autenticada ficticia.
- CI focalizado B163 ejecuta Node24, pnpm9/frozen, tests de navegación, compilación tipada, lint, formato, Chromium y build Vite de producción. Todo contra el SHA exacto y sin subir tokens, mapas, capturas ni artefactos de navegador.
- No modifica los endpoints, auth, API, los permisos, el estado académico, Mobile, el lockfile ni el despliegue.

## No equivale a HTTP 404

El servidor SPA puede devolver HTML con respuesta 200 para una navegación profunda; este cambio incorpora un **estado 404 en el cliente**, no un código HTTP 404 en CDN/servidor. Un futuro servidor de producción podría resolver códigos HTTP y SEO sin comprometer recuperación de deep links. No se introduce un comportamiento de servidor nuevo sin definición de su contrato.

## Gate de release

El PR permanece Draft si hay gates globales fallidos: las vulnerabilidades #133 `node-forge` y #141 `braces` mantienen `pnpm audit --prod --audit-level high` bloqueante y #353 en HOLD. El PR B156 corrige aparte el runner del smoke Mongo8, pero no está fusionado en `main` y este bloque no lo duplica. No hay autorización para merge ni deploy por un check Web específico verde.
