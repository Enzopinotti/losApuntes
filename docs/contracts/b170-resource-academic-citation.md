# B170 — Referencias académicas de apuntes (Web)

Fecha: 21 de octubre de 2026. Base original: main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9. Carrier actual: main@1f30c9078b5317206e9ae2cd7b9f0aa02e3293b3.

## Alcance funcional

Los recursos autorizados muestran títulos, materias, visibilidad y atribución visible de autor. B170 suma una **referencia sencilla y revisable antes de copiarla**, sin afirmar conformidad con APA/MLA o verificar autorías inexistentes.

- El estudiante pulsa **Preparar referencia** en un recurso visible. No se hace copia automática ni petición extra al servidor.
- La referencia usa únicamente título, nombre de materia y autor visible. Si el nombre de autor falta, aparece «Autoría no indicada». La fecha es «(s. f.)» (sin fecha); no se deriva de timestamps técnicos.
- Solo si la visibilidad vigente en el recurso recibido es **public**, se incluye un enlace absoluto del mismo origen a /resources/:resourceId. El enlace no transmite tokens, grants, query ni hash, y no reemplaza la verificación de permisos al abrirlo.
- Los recursos **private** y **shared** mantienen la atribución, pero **no incluyen enlace**, incluso cuando el usuario tiene acceso a su contenido. Se explica expresamente que copiar una referencia no concede acceso.
- Los metadatos se normalizan eliminando controles, escapes bidireccionales y saltos de línea. Datos vacíos, tipos incorrectos, campos demasiado extensos o IDs no UUIDv4 se rechazan sin inventar texto.
- El estudiante revisa el texto en un textarea de solo lectura. El botón **Copiar referencia** usa el portapapeles del navegador tras un clic. Ante error, el campo permanece seleccionable manualmente.
- La clave React del componente incluye sesión, usuario, recurso, visibilidad y título, evitando mantener confirmaciones de copia a través de esos cambios.

## Contrato de calidad

- 10 pruebas deterministas sobre enlaces públicos y no públicos, autor ausente, ausencia de fecha, caracteres bidi, origin URLs hostiles, IDs malformados, visibilidad desconocida, copia explícita y ausencia de persistencia.
- Prueba real Chromium sobre Vite en loopback: recurso público para invitado con portapapeles opt-in; recurso privado con sesión autenticada y texto sin URL/ID; invitado rechazado para el recurso privado; cero HTTP mutaciones realizadas por el flujo.
- Validación local con Node 24 y pnpm 9.15.9: `corepack pnpm test:web-resource-citation-b170` (10 PASS), aceptación Chromium, TypeScript, ESLint sin warnings, Prettier, build Web y `git diff --check` — todo PASS.
- El contrato determinista se integra a `pnpm test`; la prueba Chromium se ejecuta explícitamente para no exigir un navegador al test general.
- No se ejecutó CI ni se modificaron workflows.

## Límites

Esto no crea bibliografía APA validada ni acredita autoría legal, fechas editoriales o accesibilidad futura del enlace. No agrega endpoints, permisos, lecturas automáticas, cookies, analytics, descargas ni guardado local. La copia manual de un título privado depende de una acción consciente del usuario autorizado.

La auditoría productiva aún reporta 2 HIGH y 3 MODERATE; el release #353 permanece HOLD. Integrar la función en `main` no aprueba un despliegue.
