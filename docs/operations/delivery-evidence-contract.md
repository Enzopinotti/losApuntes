# Contrato de delivery, trazabilidad y evidencia

**Estado:** Activo  
**Alcance:** Backend, Web, Mobile, documentación y operación  
**Autoridad de código:** GitHub remoto  
**Registro operativo:** Backlog maestro de Los Apuntes, identificado por `external_key`

## 1. Propósito

Este documento define cómo Los Apuntes demuestra que un cambio está realmente implementado, revisado, integrado y documentado.

No reemplaza los requisitos funcionales, contratos de dominio, ADR ni completion matrices. Su función es unir esas fuentes mediante una trazabilidad durable:

`requisito → external_key → issue → PR → candidate SHA → verify → merge SHA → post-merge verify → documentación`

El objetivo es que ningún cierre dependa de memoria del chat, de una rama local o de interpretar un run verde perteneciente a otro SHA.

## 2. Fuentes de autoridad

La autoridad se separa por responsabilidad:

| Fuente | Autoridad |
| --- | --- |
| GitHub `main` remoto | código integrado actual |
| PR e issue de GitHub | discusión, review y carrier de integración |
| CI `verify` | evidencia automatizada sobre un SHA exacto |
| Docs de dominio/contrato/ADR | comportamiento y límites aceptados |
| Completion matrix | evidencia necesaria para declarar cerrado un slice |
| Backlog Excel / futuro TOP Tasks | planificación, historial y trazabilidad por `external_key` |
| Entorno productivo/piloto | evidencia externa que CI local no puede simular honestamente |

El Excel no reemplaza GitHub como autoridad de código. GitHub tampoco reemplaza el Excel como historial de planificación y decisiones.

## 3. Registro mínimo de trazabilidad

Cada carrier que modifica producto, seguridad, persistencia, runtime, CI o contratos debe poder reconstruirse con estos datos:

| Campo | Regla |
| --- | --- |
| Requisito | ID canónico cuando exista, por ejemplo `ALUM-FR-004` |
| `external_key` | clave estable del backlog, por ejemplo `ALUM-013` |
| Issue | problema/product scope que justifica el trabajo |
| PR | carrier de integración |
| Base SHA | `main` desde el que partió el carrier |
| Candidate SHA | HEAD exacto validado antes de merge |
| Candidate verify | run que certifica exactamente ese HEAD |
| Reviews | threads relevantes y su resolución basada en evidencia |
| Merge SHA | commit que realmente entró a `main` |
| Post-merge verify | run `push` sobre el Merge SHA |
| Evidencia runtime | job y marcadores cuando la afirmación depende del runtime |
| Documentación | archivos promovidos de Candidate a Implementado/Validado |
| Límites honestos | lo que el carrier no afirma resolver |

No se considera suficiente escribir “CI verde” sin registrar el SHA y el run correspondientes.

## 4. Estados de trabajo y compatibilidad con TOP

La planificación usa únicamente los estados canónicos compatibles con TOP Tasks:

- `todo`;
- `in_progress`;
- `done`.

`blocked` no es un cuarto estado de Task. Es metadata operativa mediante `blocker_state` / `blocked_by`.

Las columnas mínimas preparadas para futura importación a TOP son:

- `external_key`;
- `title`;
- `description`;
- `status`;
- `priority`;
- `starts_at`;
- `due_at`;
- `assignee_emails`.

Las columnas de planificación adicionales pueden convertirse en notas estructuradas durante la importación, pero no deben crear silenciosamente campos nuevos en el dominio de TOP.

Todos los comentarios, notas y textos operativos que puedan terminar visibles en TOP deben escribirse en español. Los identificadores técnicos, nombres de código y códigos de error conservan su forma canónica.

## 5. Secuencia obligatoria de un carrier

### 5.1 PRE

Antes de modificar código o documentación:

1. crear o activar el `external_key` correspondiente;
2. registrar una entrada PRE en `Registro de Trabajo`;
3. indicar base SHA, alcance, exclusiones y criterio de salida;
4. declarar dependencias reales sin inventar responsables, fechas o assignees.

Si el trabajo no tiene `external_key`, primero se decide si merece una tarea real o si forma parte de una tarea existente.

### 5.2 Implementación

- partir del `main` remoto actual;
- mantener cambios en unidades lógicas;
- no usar commits vacíos/no-op;
- no mezclar scope nuevo con un fix de review;
- preservar las autoridades de dominio existentes.

Cada cambio significativo se registra en el Excel con su commit/SHA y efecto.

### 5.3 Candidate exact-head

Antes de integrar:

1. el PR debe apuntar al HEAD que se pretende mergear;
2. el workflow debe ejecutar sobre ese mismo SHA;
3. Quality Gate y todos los gates aplicables deben pasar;
4. los fallos se clasifican antes de modificar código;
5. un run verde de un SHA anterior no certifica el candidato actual.

Cuando una afirmación depende de runtime, no basta con que el job finalice `success`: se verifican también los markers/logs que demuestran el escenario relevante.

### 5.4 Review

Un thread válido reabre el trabajo aunque el CI anterior estuviera verde.

Proceso:

1. registrar el hallazgo en Excel;
2. cambiar la tarea afectada a `in_progress` si ya figuraba `done`;
3. registrar PRE de la corrección;
4. implementar;
5. generar nuevo exact-head CI;
6. responder el thread con commit + run + evidencia;
7. resolverlo sólo después de demostrar el invariant.

Nunca se baja el criterio de una completion matrix sólo para hacer desaparecer un review. Si la matriz exige runtime y sólo existe unit test, se agrega la evidencia runtime o se corrige explícitamente la matriz con una razón válida.

### 5.5 Merge protegido

Antes del merge:

- PR abierto y no draft;
- `mergeable=true`;
- `mergeable_state=clean`;
- cero threads de review abiertos;
- candidate verify verde;
- HEAD del PR sin cambios posteriores.

El merge debe usar protección por HEAD esperado cuando la herramienta lo permita (`expected_head_sha`).

El Merge SHA se registra inmediatamente en Excel.

### 5.6 Post-merge

El trabajo no queda cerrado sólo porque GitHub informó `merged=true`.

Se requiere:

1. confirmar que `origin/main` apunta al Merge SHA;
2. localizar el workflow `push` de ese mismo SHA;
3. exigir los gates aplicables otra vez;
4. confirmar runtime smoke cuando corresponda;
5. registrar run y job relevantes.

Sólo después se puede promover documentación de Candidate a Implementado/Validado.

### 5.7 POST final

Al cerrar:

- tarea `done`;
- porcentaje 100%;
- blockers eliminados;
- merge SHA;
- candidate verify;
- post-merge verify;
- review evidence;
- documentación reconciliada;
- límites/no-alcance conservados;
- `migration_ready=no` para históricos que no deben importarse a TOP como tareas activas.

## 6. Checklist de cierre

Un slice sólo se declara cerrado cuando las respuestas aplicables son “sí”:

- ¿Existe `external_key` y está registrado el PRE?
- ¿El scope corresponde a un requisito/issue real?
- ¿El código parte del `main` remoto actual?
- ¿Los tests cubren paths positivos, negativos y concurrencia relevante?
- ¿El candidate verify corresponde al HEAD exacto?
- ¿Los gates críticos aplicables están verdes?
- ¿El audit de dependencias de producción está verde?
- ¿El runtime smoke requerido pasó?
- ¿Los markers runtime requeridos aparecen en logs?
- ¿Todos los reviews válidos fueron respondidos con evidencia?
- ¿No quedan threads abiertos?
- ¿El merge usó el HEAD esperado?
- ¿Se registró el Merge SHA?
- ¿El post-merge verify corresponde exactamente al nuevo `main`?
- ¿La documentación refleja el comportamiento integrado y no el deseado?
- ¿Los límites honestos siguen visibles?
- ¿El Excel tiene POST final y estado `done`?

Si alguna respuesta necesaria es “no”, el cierre sigue abierto.

## 7. Evidencia externa

Algunas tareas no pueden cerrarse con CI del repositorio:

- proveedor transaccional real de email;
- DNS/dominio;
- OAuth de producción;
- HTTPS/ingress real;
- almacenamiento de producción;
- App Store / Play Store;
- dispositivo iOS/Android real;
- piloto con usuarios y catálogo reales;
- políticas legales/retención aprobadas.

Esas tareas permanecen abiertas hasta que exista evidencia del entorno correspondiente. No se simula evidencia externa para completar una matriz.

## 8. Reapertura ante evidencia insuficiente

Si un review o una auditoría demuestra que una afirmación de cierre excede la evidencia real:

1. la tarea vuelve a `in_progress`;
2. se registra el motivo y el thread;
3. se bloquea cualquier promoción documental dependiente;
4. se agrega la evidencia faltante o se corrige la afirmación;
5. se ejecuta un nuevo exact-head verify;
6. recién entonces se cierra nuevamente.

La reapertura no borra el cierre anterior: el historial queda en `Registro de Trabajo`.

## 9. Caso de referencia — Alumni lifecycle v1

Alumni es el primer cierre completo bajo este contrato.

| Elemento | Evidencia |
| --- | --- |
| Issue | #12 |
| Tareas | `ALUM-006` a `ALUM-013` |
| Carrier funcional | PR #67 |
| Candidate funcional | `bbf35aba3a6f330ae94c21fe3b3559d06934a6e3` |
| Candidate verify funcional | #851 / run `36041222896` |
| Merge funcional | `f331c58d138659ccd460f1e2d7d4fbe032254150` |
| Post-merge funcional | #852 / run `36041957764` |
| Carrier evidencia/documentación | PR #68 |
| Candidate evidencia | `0372ba7722ed4caaba85b298bde4c651c818d255` |
| Candidate verify evidencia | #854 / run `36043648247` |
| Runtime evidence | job `107782181508`; markers `stale-follow-target-omitted-from-lifecycle` y `stale-follow-target-omitted-from-home` |
| Merge evidencia/docs | `eae148fcc278ef140e8f3846abe9f2b36471f8b6` |
| Post-merge evidencia/docs | #855 / run `36044209578` |
| Estado | Implementado / Validado |

Este ejemplo demuestra una regla importante: un review válido reabrió `ALUM-013` después de un CI verde porque la matriz decía “unit + runtime” y el runtime todavía no demostraba ese caso. Se agregó el escenario real, se revalidó y recién entonces se cerró.

## 10. Qué no debe duplicar este documento

Este contrato no debe copiar:

- reglas de negocio de Auth, Academic, Profile, Files, Search, Social, Feeds, Organizations o Alumni;
- contratos HTTP;
- decisiones ADR;
- requisitos funcionales canónicos;
- políticas legales todavía no aprobadas.

Debe enlazar esas fuentes y registrar cómo se demostró el cierre, no convertirse en otra especificación funcional.

## 11. Aplicación a los siguientes bloques

Producción, Pilot y Mobile deben usar la misma secuencia.

Cuando una tarea futura se importe a TOP, `external_key` conserva la identidad entre Excel y Task. La información histórica de commits, reviews, evidence y límites puede viajar como comentario/nota estructurada en español sin convertir esos datos en nuevos campos del dominio Task.
