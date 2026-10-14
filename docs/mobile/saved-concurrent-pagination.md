# Bloque 23 — Paginación de Guardados ante cambios concurrentes

**Estado:** preparado para PR; sin CI, tests ejecutados ni QA nativo.  
**Requisitos reutilizados:** RES-FR-009, SEARCH-FR-002/006, MOB-FR-005/007/008, NFR-SEC-001.  
**Rama:** `feat/saved-search-stale-cursor-recovery-20261014`.

## Problema real

Los cursores de `GET /resources/saved/search` están vinculados al actor,
filtros y orden, pero ese contrato solo confirma la identidad de los filtros.
No garantiza que el **apunte que marcó el límite de la página anterior** siga
guardado, accesible o con el mismo orden. En particular, si el título cambia
entre peticiones, el cursor A–Z puede continuar desde una posición obsoleta.

## Funcionalidad

Al recibir un cursor v1 (guardado por fecha) o v2 (título A–Z), el servicio:

1. Decodifica el cursor y verifica su scope por cuenta, query, Subject y orden.
2. Consulta exclusivamente el save del actor por `userId/resourceId`, usando
   el índice único existente. Para v1 confirma también `createdAt` exacto.
3. Reutiliza `authorizedSavedJoinStages` para comprobar que el recurso sigue
   disponible, que el texto/materia siguen coincidiendo y que la visibilidad y
   el permiso compartido siguen vigentes. Para v2 compara además el título
   del anchor mediante la **misma colación española strength 1**.
4. Solo si el anchor sigue vigente, ejecuta el query de la siguiente página.
   Si no, devuelve **HTTP 409** con código
   `RESOURCE_SAVED_SEARCH_CURSOR_STALE` y mensaje de actualización.
   Nunca devuelve una página vacía simulando que terminó la biblioteca.

El query de validación usa `maxTimeMS=8000`, resulta acotado a un save y
no transporta permisos ni títulos en la respuesta. Su presupuesto excedido
conserva el manejo de timeout explícito del bloque 21.

## Mobile y experiencia

El controlador distingue `data_changed` de `cursor_cycle`. Si la API
responde exactamente con el código y HTTP 409 previstos:

- Mantiene los recursos ya cargados y autorizados previamente.
- Anula solo el cursor de continuación obsoleto.
- Presenta «Tus guardados o sus permisos cambiaron» y **Reiniciar listado**.
- Evita continuar infinitamente con el mismo cursor, aunque se presione
  «Cargar más» repetidas veces.
- Reiniciar solicita la primera página de la combinación actual de cuenta,
  texto, materia y orden; no reusa la continuación vieja.

Otros errores 409, sin red o timeout siguen el manejo previo: **no** se
interpretan como un cambio de datos. No hay nuevas rutas ni permiso de
escritura.

## Alcance y garantías limitadas

**No es una lectura snapshot.** Cambios en elementos distintos del anchor
pueden alterar la posición de otros apuntes entre páginas. El controlador
deduplica ítems por ID, pero no puede recuperar un elemento que se movió
antes del cursor sin reiniciar desde la primera página. Tampoco implica
revalidación continua de tarjetas previamente renderizadas: al abrir
recursos el servicio vuelve a autorizar acceso según la política existente.
Para snapshot real se requeriría versionado del resultado o snapshots
persistentes con una estrategia de retención explícita.

En títulos equivalentes según colación española (ej. acentos/caso), el
anchor puede seguir siendo válido porque su posición de orden no cambió;
el ID continúa como desempate.

**Costo:** un lookup indexado adicional por página filtrada, con verificación
ACL de Resource/share. Es una decisión de consistencia que debe medirse
en staging junto con los `explain` del bloque 22. El listado histórico
`GET /resources/saved` no cambia ni realiza estas verificaciones nuevas.

## Matriz de aceptación pendiente

| Caso | Respuesta esperada |
| --- | --- |
| Página 2 con anchor todavía guardado y legible | 200, misma paginación |
| Save del anchor eliminado | 409 `RESOURCE_SAVED_SEARCH_CURSOR_STALE` |
| Título del anchor movido en orden A–Z | 409; reiniciar |
| Recurso oculto/moderado | 409; sin filtrar contenido oculto |
| Share revocado | 409; sin compartir detalles |
| Materia del anchor modificada | 409 bajo filtro de Subject |
| Tags/metadata dejan de coincidir | 409 bajo filtro de texto |
| Solo mayúsculas/acento equivalente en título | Cursor puede seguir según colación |
| Cursor de otra cuenta o filtro | 422 previo, sin búsqueda |
| Cursor de fecha normal, sin cambios | Compatible |
| Guardados sin filtro por endpoint histórico | Sin cambios |
| Error 409 ajeno a este código | Error recuperable genérico |
| Stale durante carga de página 2 | Conservar página 1, botón de reiniciar |
| Cambio de cuenta o búsqueda | Descartar respuesta vieja con el fence |
| Rendimiento de bibliotecas extensas | Medir costo del lookup adicional |

**Pruebas escritas, no ejecutadas:** servicio para cursores stale/current y
scopes; pipeline Mongo para comprobación previa de ACL, colación y límites;
controlador Mobile para 409 específico, recuperación y preservación de filas.

**Política:** commits atómicos `[skip ci]`, PR sin squash, merge a `main`,
CI/tests/typecheck/build/QA de dispositivos diferidos. Hasta esa validación:
**integrado / NO validado**.
