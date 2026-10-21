# B182 — Candidato integrado del recorrido de estudio sobre seguridad B181

Fecha: 2026-10-21. Estado: **integración en PR Draft, no fusionada ni desplegada**.

## Objetivo y valor real

Conservar el avance ya implementado pero disperso, y comprobar que un estudiante puede pasar de encontrar un apunte a organizar su estudio **sin interrumpir su flujo**:

1. **B175 / PR #509:** guardar un resultado de búsqueda directamente, sin abrir la ficha.
2. **B177 / PR #511:** buscar apuntes concretos dentro de un kit portable de su materia y agregarlos al kit.
3. **B179 / PR #514:** abrir un recurso y llevarlo, mediante una transferencia opaca con reautorización, al Planificador.
4. **B180 / PR #515:** buscar apuntes y preguntas directamente en el Planificador y sumarlos con verificación actual de accesos, sin duplicados, hasta 24 actividades y 1.200 minutos.

Los cuatro bloques se prueban sobre **la misma base B181 / PR #516**, que ya incorporó `follow-redirects@1.16.1` y restableció el smoke completo de MongoDB 8 en un runner compatible. No se edita ningún bloque funcional para forzar resultados ni se desactiva la auditoría.

## Composición exacta y trazable

- `main` original: `6bd965c71f6426da3d49fc7c0555e0e5afda06a9`.
- Base de seguridad y runtime: `adcbd25c40f586803e4be59c4cbfae7e400200fd` (B181).
- Fuentes inmutables: PR #509 `c700d93a96307fedb10461feb15de73b7bd5482e` (7 archivos), PR #511 `42cb9ca22ea57e92c213dd3ff40ef5192a446a77` (8), PR #514 `27e799250cb81e798cff83248d44a2706286ce1e` (9) y PR #515 `ea6024532c8d09a255fa11b8c7a9b896e4a451e3` (8).
- **32 archivos idénticos** a los blobs Git originales, reproducibles por `scripts/integration/b182-study-journey-sources.json` y validados por hash en `scripts/test-b182-study-journey-integration.mjs`.
- **Conflicto lógico reconciliado:** #514 y #515 modificaban `scripts/test-web-study-handoff-integration.mjs`. Se conserva la versión #514, que suma casos de permiso, sujeto, ámbito de cuenta/sesión y expiración. B180 se integra excluyendo únicamente su copia menos completa de ese archivo. Su buscador y los demás archivos quedan sin alteraciones.
- Se preservan los workflows focalizados de #511, #514 y #515. El B182 agrega **una** prueba de procedencia y contratos cruzados; cada transición tiene un commit de adopción distinto.

## Autorización y privacidad

- Los resultados de búsqueda **no otorgan acceso permanente**: la selección de materia procede de Contextual Discovery y las acciones de agregado verifican el recurso/pregunta nuevamente contra el servidor.
- Scope de requests y acciones por usuario/sesión/materia/filtro. Los pases al Planificador usan un token opaco, de un solo uso y con vencimiento; el Planificador vuelve a validar.
- Ningún texto, título, archivo firmado o credencial ajena debe terminar en URLs ni en JSON de transferencia. Los archivos portables sólo guardan IDs y configuración elegida; no otorgan permisos.
- Se preserva la paginación de recursos y preguntas, las condiciones de error y las fuentes anteriores; no se agregan peticiones por pulsación de tecla.
- No cambia autenticación, base de datos, roles, backend, API, pagos ni dependencias adicionales. No se importan bloques de PR Draft ajenos al recorrido.

## Criterios de aceptación

1. Exact-head: hashes de los 32 blobs, prueba de seguridad B181, 4 contratos de origen + handoff + planner y `pnpm --filter @losapuntes/web check:types` / `lint` / `format:check` / `build` aprobarán juntos.
2. Quality Gate y diez coberturas críticas deben pasar en el **SHA combinado**, no extrapolar estados de los PR de origen.
3. El smoke global de Chromium Auth + API, MongoDB 8, Files, Search, Q&A y demás servicios debe pasar en ese mismo commit, con cleanup de Docker.
4. Browser acceptance específico de UI: estudiante autenticado busca → guarda → abre recurso → transfiere al plan → agrega preguntas de la materia → organiza kit; con segunda página, límites de duración, cuenta alterna y pérdida de permisos durante la operación.
5. Rechazar reuso de nonce, scopes cruzados, recurso sin permiso, consulta inválida o doble click.
6. Validar revisión y aprobación humana antes de mover cualquiera de los PR de origen; decidir reconciliación de PRs originales para evitar integraciones duplicadas.
7. **Auditoría productiva estricta:** `pnpm audit --prod --audit-level high` continúa obligatoria. B181 redujo 4 HIGH a 2 HIGH, pero `node-forge` #133 y `braces` #141 carecen de parches upstream confirmados. No waiver, no bypass. Release #353 sigue HOLD y la rama permanece Draft aunque pasen todas las verificaciones funcionales.

## Evidencia de cierre

Registrar SHA final, resultado de contrato B182, regresiones de cada bloque, formato/build, Quality Gate, 10 coberturas, smoke y número exacto de hallazgos de audit. No marcar PASS antes de la ejecución real. Sin merge ni deploy mientras #353 esté en HOLD.
