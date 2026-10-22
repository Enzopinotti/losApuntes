# B76 — Integridad del inventario de contribuidores en Account Export

## Contexto comprobado

En `main@a763ddc4bf85374d27208ce05db5e7c26bf3c118` la prueba `Account export v2 compatibility — B45 › does not publish v2 when its contributor is missing or the inventory is altered` fallaba: un registro v2 de 31 secciones más `unreviewed.private` publicaba de todos modos un JSON de 31 secciones. El assembler verificaba solo la proyección de las 31 secciones que iba a serializar; por lo tanto, no detectaba proveedores privados desconocidos.

## Contrato B76

- Antes de la primera escritura, se rechaza cualquier contribuidor cuyo `sectionId` no pertenezca al **manifiesto canónico v3**, hoy de 32 secciones. Esto alcanza exports v1, v2 y v3.
- Para cada job se siguen requiriendo todas las secciones de **su versión histórica exacta** (v1: 30, v2: 31, v3: 32), con el orden, byte shape, SHA-256 y streaming ya existentes.
- Un módulo v3 puede ejecutar trabajos persistidos v1 o v2 sin incluir `study.collections` o `study.progress` en su resultado cuando no pertenecían al formato solicitado. Proveedores futuros **no son aceptados silenciosamente**: primero se debe revisar y versionar explícitamente el inventario.
- Un `sectionId` inesperado produce error **antes de `sink.write`, consulta al owner o commit**. No se emite un artefacto aparentemente exitoso e incompleto. Los checks de duplicate ID y missing mandatory ID permanecen vigentes.
- La nueva suite independiente `account-export-contributor-allowlist.spec.ts` ejecuta el rechazo contra los tres formatos, verifica cero bytes escritos, cero consultas a contribuidores y ausencia de `commit`. También prueba la compatibilidad legacy v1/v2 sobre el módulo v3. La suite histórica `account-export-versioning.spec.ts` se conserva intacta para no entrar en conflicto con el formatter #349.

## Límites de integración

La seguridad del exportador sigue dependiendo de su control owner-scoped, epoch v3 y lease del worker; este cambio añade solamente un control de wiring previo. No altera endpoints, datos, permisos, persistencia, locks ni la política de dependencias.

El workflow focalizado ejecuta los tests de assembler/versioning y de la nueva suite B76, más lint del ensamblador y del spec nuevo con checkout del **SHA exacto del PR**. El formato de los tests históricos sigue a cargo del carril #349: no se oculta ni excluye del CI global. El workflow global continúa como gate obligatorio. #331 trabaja las pruebas del assembler v1, #349 el formato API, #369 los fixtures privados B72/B73, #370 el wiring epoch v3 y #351 el CAS de colecciones. No reescribir estos carriers; reconciliar antes de mergear.

Sin aplicación levantada ni despliegue.
