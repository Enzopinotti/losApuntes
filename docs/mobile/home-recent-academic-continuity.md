# Bloque 26 — Continuidad de estudio por materia actual desde Inicio

**Rama:** `feat/home-recent-academic-continuity-20261014`  
**Fecha:** 14 de octubre de 2026  
**Estado:** código candidato, pruebas escritas pero **NO ejecutadas**.  
**Trazabilidad:** MOB-FR-001/005/007/008, RES-FR-008/009, NFR-SEC-001.

## Alcance de producto

Inicio ya mostraba `Retomá tus guardados` y, desde el bloque 25,
`Abiertos recientemente`: el primero corresponde a saves persistentes y
el segundo a IDs abiertos durante la **sesión de la app**, no a PDFs leídos
ni progreso de estudio. Este bloque conecta la segunda tarjeta con la
**materia actual seleccionada** en Contexto Académico.

- Muestra **«Materia actual: ...»** a partir de la participación académica
  elegida y un acceso directo a **«Preguntas de mi materia»**.
- Prioriza, dentro de los cuatro recientes reautorizados que se presentan,
  los apuntes de la materia actual. Conserva el orden MRU dentro de esa
  materia y luego dentro de las demás; no borra ni oculta el resto del
  historial por defecto.
- Ofrece un selector accesible **«Todos / Mi materia»**. «Mi materia» limita
  la vista previa a recursos cuya `resource.academic.subject.id` coincide
  con la materia actual. Su contador describe *esta vista previa*, no todo
  el catálogo ni la biblioteca.
- Cada apunte reciente conserva **«Volver al apunte»** y suma
  **«Preguntas de esta materia»**, reutilizando
  `savedSubjectQuestionsAction`, que verifica el UUID de ruta. La pantalla
  de preguntas aplica sus reglas propias de lectura y publicación.
- Si no hay materia actual elegida, se conserva el orden original de
  recientes y no aparece un acceso contextual con materia inventada.
- Si no se abrieron apuntes de esa materia dentro de los recientes
  disponibles, la vista filtrada presenta una explicación y permite
  elegir Todos. El acceso al feed de preguntas de materia actual sigue
  funcionando aunque aún no se haya abierto un apunte de esa materia.

## Resolución de contexto y permisos

El backend académico devuelve
`AcademicCurrentContext.subjectParticipationId`, **NO el Subject ID**.
`homeSelectedCurrentSubject` busca por esa participación exacta en
`AcademicContextData.participations`, acepta solo estado `current` y
valida el `subjectId` con la política de rutas existente. No compara
nombres de materias ni confunde IDs de participación y de Subject.

`HomeScreen` entrega ese contexto únicamente cuando el snapshot
académico corresponde a la sesión autenticada actual y la superficie
está activa. Al cambiar la participación, su autoridad/correspondiente
`subjectId` invalidan la consulta anterior y se carga otra vez la
vista reciente con el filtro de prioridad actualizado.

`HomeRecentOpenedController` sigue consultando **cada ID reciente por
API autenticada antes de renderizar títulos, nombres de materias u
acciones por apunte**. La priorización de cuatro filas ocurre después
de completar las autorizaciones. Los recursos revocados/ocultos se omiten.
Cambiar contexto no cambia ni mezcla los IDs efímeros de sesión; un
cambio de usuario/sesión reinicia el registro existente.

Las rutas `/questions/subjects/[subjectId]` son **selectores de feed**,
no concesiones de acceso o capacidad de publicar. La navegación al apunte
vuelve a validar permisos en su detalle. No hay endpoint nuevo, sesión
adicional, permisos elevados, tracking de lectura, caché, migración
ni cambio en el ranking del feed.

## Límites importantes

- Solo se conservan hasta **8 IDs en la sesión**; el preview muestra
  hasta **4**. Priorización por materia actual **no significa** buscar en
  todos los recursos disponibles del sistema.
- Recursos de otras materias pueden aparecer debajo de los de la
  materia actual en Todos. El orden no representa una recomendación
  algorítmica ni tiempo de estudio.
- Las participaciones académicas `planned/completed/dropped` no se
  anuncian como «materia actual». Si el contexto no se resuelve
  correctamente, se recurre a la vista genérica.
- La tarjeta no registra aperturas del PDF, minutos, progreso ni
  sincroniza historial entre dispositivos.
- Al montar Inicio se pueden ejecutar hasta ocho requests autorizados
  individuales por el bloque 25. Este bloque no aumenta esa cota;
  las mediciones de red/latencia y accesibilidad siguen pendientes.

## Matriz de aceptación (pendiente de ejecución)

| Escenario | Resultado esperado |
| --- | --- |
| Participación actual seleccionada | Resuelve Subject ID y nombre correctos |
| Contexto sin selección | No inventa materia ni filtra recientes |
| Participación planeada o ajena | Vista genérica, sin CTA falso |
| Subject ID inválido | No construye ruta académica |
| Apunte de materia actual es el quinto más reciente | Puede subir al preview de cuatro tras reautorizar |
| Dos apuntes de la materia actual | Mantienen su orden de apertura relativo |
| «Todos» | Incluye recursos de otras materias cuando entran al preview |
| «Mi materia» sin coincidencias | Estado vacío localizado y opción de volver a Todos |
| Preguntas de materia actual | Ruta UUID canónico; backend revalida acceso |
| Preguntas de un apunte | Reutiliza la ruta ya implementada |
| Cambio de participación | Consulta de recientes cambia de prioridad |
| Cambio de sesión | No reutiliza datos de otra cuenta |
| Recurso revocado o borrado | No se muestra ni habilita su acceso |
| Falla de red y reintento | Conserva la prioridad y explicita fallo |
| Limpiar recientes | Borra solo IDs en memoria, no Guardados |
| TalkBack/VoiceOver | Radios, títulos y CTAs con etiquetas comprensibles |
| Calidad y rendimiento | Tests/typecheck/dispositivos y latencia bajo gate conjunto |

## Calidad y política de merge

Pruebas agregadas en
`apps/mobile/test/home-recent-academic-continuity.test.ts` para
participación/Subject, prioridades estables, no contexto, estado planned,
IDs inválidos, cuatro recursos, cambio de materia, rutas de preguntas
y cableado. Se ajustó la regresión de wiring del bloque 25. **No se
ejecutaron tests, CI, lint, typecheck, builds, benchmarks ni QA Android/iOS.**

Fusionar con commits atómicos `[skip ci]` mediante **merge commit sin
squash**; registrar **integrado / NO validado** hasta la validación
conjunta sobre el SHA exacto de `main`.
