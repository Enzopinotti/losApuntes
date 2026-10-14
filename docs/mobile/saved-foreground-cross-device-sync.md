# Bloque 24 — Sincronización de Guardados entre dispositivos

**Estado:** implementación candidata en `feat/saved-foreground-cross-device-sync-20261014`; **sin validación ejecutada**.  
**Trazabilidad:** RES-FR-009, MOB-FR-005/007/008, NFR-SEC-001 y NFR-PERF-001.

## Objetivo y comportamiento real

Guardados ya se recargaba al recuperar el foco o volver del segundo plano.
El problema era que los cambios realizados en otra sesión mientras el
estudiante mantenía abierta la pantalla permanecían invisibles hasta salir,
volver a entrar o actualizar manualmente.

Ahora se agrega un chequeo **cada 90 segundos, únicamente mientras la
pantalla Guardados está enfocada y la app está activa**. No existe polling en
background, websockets, push, colas, retención de eventos ni una nueva
colección Mongo. No hay persistencia local de resultados privados. Los
endpoints existentes mantienen `Cache-Control: private, no-store`.

El controller `MobileSavedResourcesController.sync` vuelve a descargar
**solo la primera página** usando la sesión, texto, materia y orden vigentes,
con todos los controles de acceso de la API. Compara IDs y metadatos completos
(incluida revision) y el cursor de continuación contra los que se cargaron
en la primera página anterior.

- **Sin cambios en primera página:** no reinicia paginación, mantiene filas
  y cursors posteriores cargados. No salta al principio.
- **Cambio detectado:** reemplaza los resultados por la primera página
  autorizada, descarta páginas y cursores anteriores, reinicia el scroll una
  sola vez y muestra un mensaje accesible de actualización. Esta decisión
  evita concatenar páginas calculadas con dos estados diferentes.
- **Sin conexión / timeout:** conserva los apuntes cargados y deja un aviso
  explícito de sincronización pendiente. La acción **Comprobar cambios**
  permite reintentar en cualquier momento.
- **Carga, carga de más o desguardado en curso:** el polling no interrumpe
  operaciones. Las cancelaciones usan el generation fence y AbortController
  ya existente.
- **Cambio de cuenta, foco, orden, materia o consulta:** el controller
  cancela/descarta resultados obsoletos. Suspender limpia el indicador
  `syncing`; reingresar sigue recargando la biblioteca desde la primera
  página.

La pantalla conserva la actualización manual por pull-to-refresh, además
del botón nuevo «Comprobar cambios».

## Materias

`MobileSavedSubjectFacetsController.sync` consulta los conteos globales del
usuario en la misma cadencia, sin ocultar los chips mientras carga. Si falla,
mantiene los conteos visibles y advierte que pueden estar desactualizados.
Si la materia seleccionada desaparece de los resultados actualizados, la
pantalla vuelve a «Todas las materias» según su flujo existente.

## Seguridad

La consulta se realiza mediante la API autenticada existente. El server
reautoriza cada recurso antes de proyectarlo. En la UI nunca se fusionan
páginas de cuentas diferentes. Los permisos revocados pueden desaparecer
al recargar la primera página, pero **no se garantiza revalidación continua
de todas las filas previamente descargadas**.

## Límites y decisiones explícitas

1. **No es sincronización push en tiempo real.** En foco se consulta cada
   90 s; la app suspendida no consume red para esta tarea.
2. **Cobertura parcial:** solo se compara la primera página autorizada.
   Un cambio que afecte exclusivamente a elementos de páginas profundas
   puede no detectarse hasta recarga, cambio de filtro, navegación o acceso
   al recurso. El acceso al detalle siempre revalida permisos.
3. La sincronización ocurre por *polling* de página completa, no por revisión
   incremental de eventos o digest; requiere medir tráfico y batería en
   dispositivos. Mantener el intervalo conservador y revisar en staging.
4. Cambios concurrentes dentro de una petición no crean snapshot global.
   Las protecciones de cursor obsoleto (bloque 23) siguen vigentes al paginar.
5. La comparación de recursos utiliza JSON de la proyección de la primera
   página: campos volátiles futuros podrían generar falsos positivos; evaluar
   una revisión semántica específica si cambia el contrato del recurso.

## Matriz de aceptación pendiente

| Escenario | Esperado |
| --- | --- |
| Guardar en otro dispositivo mientras Guardados está abierto | Nueva fila visible después del siguiente chequeo, si entra en primera página |
| Desguardar desde otra sesión | La primera página refrescada deja de mostrarlo |
| Modificar título o metadata de apunte guardado | Detectar cambio y reiniciar paginación |
| 3 páginas cargadas, primera sin cambios | Se conservan las 3 páginas; no hay salto al inicio |
| 3 páginas cargadas, primera modificada | Descartar páginas antiguas y reiniciar en primera |
| Error de red durante chequeo | Mantener contenido y mostrar error recuperable |
| Cambio de usuario con petición pendiente | Abort + resultado anterior descartado |
| Cerrar pantalla o ir a background | No ejecutar nuevas solicitudes periódicas |
| Desguardado en curso | No interrumpir la operación |
| Conteos de materias cambian | Actualizar chips sin spinner de pantalla completa |
| Fallo de conteos | Conservar chips, advertir riesgo de conteos desactualizados |
| Revisión sin cambios | Sin mensaje de actualización ni salto de scroll |
| Botón Comprobar cambios | Sincronización manual autenticada y acotada |
| Accesibilidad Android/iOS | Estados y errores legibles, sin anuncios repetidos |
| Tráfico, batería y latencia | Medir en dispositivos; no hay SLA comprobado |

**Pruebas agregadas pero NO ejecutadas:** sincronización con/sin cambios,
paginación y filtros, metadatos, offline, cancelación por cuenta, suspensión,
operación de quitar guardados, facetas, recuperación y montaje del
temporizador foreground-only.

**Proceso:** PR con commits atómicos `[skip ci]` y merge commit sin squash;
sin CI, tests, typecheck, build, carga ni QA móvil en este bloque. Estado
tras el merge: **integrado / NO VALIDADO** hasta el gate conjunto sobre SHA
exacto de `main`.
