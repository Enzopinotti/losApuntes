# B142 Web — Objetivos personales y seguimiento por intento en Study Practice

**Base verificada:** `main@334b8de4d6394c9ece0bab2e1136ade005f41fc3` (B141 Web).
**Alcance:** frontend de práctica / modelo puro. Independiente de PR #464 (Mongo) y #465 (audit).

## Necesidad resuelta

Las rondas ya permitían clasificar preguntas, reordenarlas y cerrarlas con una revisión. B142 agrega un **objetivo concreto definido por el estudiante** dentro de cada intento, con avance visible sin convertir sus marcas subjetivas en una calificación.

La persona puede elegir una de estas metas para **1 a N preguntas de la ronda vigente**:

- **Clasificar preguntas**: una pregunta cuenta cuando el estudiante marcó explícitamente «Necesito repasar» o «Lo pude explicar».
- **Marcar preguntas como explicadas**: una pregunta cuenta únicamente con la marca manual «Lo pude explicar».

Por ejemplo: «Clasificar 3 preguntas» o «Marcar 2 como explicadas». Los selectores son nativos, muestran solo valores permitidos y requieren pulsar **Definir objetivo** o **Actualizar objetivo**. El panel indica el total registrado y lo que falta; se actualiza de inmediato cuando cambia una marca. **Quitar objetivo** no altera la ronda.

## Contrato, alcance y privacidad

- `measureRecallGoal(subjectId, ids, outcomes, kind, target)` exige una cola UUID v4 válida de 1 a 10 preguntas, marcas estrictamente pertenecientes a la cola, tipo `classified | explained` y un entero seguro objetivo entre 1 y el tamaño de la cola. Falla cerrado ante entradas inválidas.
- El resultado consta solamente de `kind`, `target`, `achieved`, `remaining`, `met`, `total`: no contiene UUID, contenidos, reflexiones, identidad del usuario ni timestamps.
- La meta queda en **React state de la pestaña** vinculada a cuenta/sesión/materia/foco, `pass` y `activationId`. Cambiar de contexto, iniciar un intento nuevo, pausar, retomar o empezar otra ronda la invalida. **No se conserva en la pausa B136**, no se añade a exports/handoff y no se persiste en API, base de datos ni almacenamiento local.
- El cálculo no depende del orden de preguntas de B140, no asigna notas y nunca cierra la ronda al alcanzar la meta. Los reintentos B134, el cierre B141 y la selección importada B139 siguen disponibles.
- El avance `<progress>` tiene etiqueta accesible, texto alternativo y diferencia explícita entre **«Objetivo personal alcanzado»** y el proceso de estudio. No se afirma dominio de la materia ni se usa gamificación con sanciones.

## Validación

```sh
pnpm test:web-study-recall-goals
pnpm test:web-study-recall-closure
pnpm test:web-study-recall-order
pnpm test:web-study-retry-round
pnpm --filter @losapuntes/web check:types
pnpm --filter @losapuntes/web lint
pnpm --filter @losapuntes/web format:check
```

El contrato B142 está integrado al `pnpm test` obligatorio y al workflow exact-head read-only. Para fusionar se necesitan B142 + regresiones, Quality Gate global, diez coberturas críticas y smoke de contenedores **del SHA definitivo**. Una prueba funcional verde no habilita producción ni suple pruebas interactivas de dos cuentas/navegadores.

**Release #353: HOLD.** Mantener `STUDY_PROGRESS_ENABLED=false`, audit productivo obligatorio y sin excepciones; `node-forge` y `braces` siguen pendientes (#133/#141 de seguridad). No desplegar ni cambiar flags, permisos, dependencias, API, DB o infraestructura.
