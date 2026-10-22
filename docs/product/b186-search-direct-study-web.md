# B186 — Preparar una sesión desde un resultado de búsqueda

**Candidato:** PR #518, continuación del recorrido de estudio B182/B185; no fusionado ni desplegado.

## Valor para el estudiante

Antes, desde una búsqueda global se podía **Ver recurso**, guardarlo o quitarlo de guardados, pero para preparar una sesión con el apunte había que abrir su ficha. B186 agrega en cada resultado de recursos un botón **Preparar sesión con este apunte** para estudiantes autenticados. Evita la navegación intermedia, conservando filtros y búsqueda hasta el momento de la acción.

## Autorización real, no atajos

Se reutiliza `ResourceStudyHandoff`, que ya funciona y fue aceptado con API/Mongo reales desde la ficha de recursos (#514). Al hacer clic:
1. Recupera nuevamente `GET /resources/:id` y `GET /discovery/contextual` con señales cancelables.
2. Sólo prepara el plan cuando el UUID del recurso y una de las primeras ocho materias actuales coinciden con la autoridad confirmada. Un resultado público de Search **no** es prueba de permiso ni de cursada.
3. Genera un pase **opaco, de un solo uso y con vencimiento**; la ruta recibe `subjectId`, no archivos, títulos, grants ni tokens de autenticación. `StudySession` reautoriza en destino antes de agregar la actividad al plan.
4. Si un apunte fue retirado, la materia ya no es actual, el usuario cambia de sesión o caduca la autorización, la operación se bloquea y muestra un error sin navegar. No se crean planes por adelantado ni se conceden accesos.
5. El usuario anónimo conserva Search público y `Ver recurso`, sin un botón de transferencia. El botón es usable por teclado, con foco visible y altura mínima 44px en móvil.

Sin endpoints, dependencias, tablas, esquemas, permisos, flags ni excepciones de auditoría nuevos. Tampoco hace llamadas adicionales por cada resultado: sólo al pulsar el botón.

## Procedencia

B182 documentó 32 blobs Git de las fuentes #509/#511/#514/#515. B185 había extendido dos blobs de Search. B186 extiende otros dos **solamente**: `apps/web/src/pages/Search.tsx` y `apps/web/src/pages/Search.scss`. El contrato de integración comprueba 28 blobs byte-idénticos y estas cuatro extensiones declaradas, sin tolerar cambios colaterales a los otros 28.

## Aceptación verificable

- Contrato Search confirma autenticación, uso del componente de transferencia original y validación de recursos/materia por API, sin secretos ni storage paralelo.
- B183 Playwright real con API simulada: desde Search, revocar la lectura de recurso evita navegar; al recuperar acceso, el botón va al Planificador con `subjectId` correcto.
- B184 Playwright con API + MongoDB reales: después de guardar/quitar/restaurar, estudiar la materia, agregar pregunta y kit, se busca el mismo apunte de nuevo, se pulsa directamente el botón en Search y se llega al Planificador con importación pendiente de autorización.
- Node24 exact-head: Search contract, provenance, Web TS/ESLint/Prettier/build, Quality Gate, diez coberturas críticas, smoke real de Mongo 8 + Chromium y cleanup.

**Release:** `pnpm audit --prod --audit-level high` se mantiene estricta. Las dos HIGH conocidas de `node-forge` (#133) y `braces` (#141) siguen siendo HOLD sin parche upstream certificado. #353 HOLD, PR Draft, ningún merge o despliegue hasta satisfacer todos los gates.
