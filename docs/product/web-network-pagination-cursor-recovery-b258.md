# B258 — Red Web: paginación sin ciclos sobre main actual

## Problema

La PR #665 implementó defensas contra cursores repetidos pero partía de un árbol apilado y obsoleto. Se verificó que los blobs base de `Network.tsx` y de su contrato de pruebas coinciden byte a byte con `main@d403f5af6da2e49280ee3bb60b4cd5e4000e957a`. Este carrier porta exclusivamente los cinco archivos propios de #665 a una rama creada desde ese main; no fusiona la historia de la rama anterior ni reemplaza otros cambios.

## Contrato

- `Siguiendo` y `Conexiones` tienen historiales de cursor independientes y limitados al alcance de usuario/sesión.
- Una página exitosa que repite el cursor actual o uno ya visitado conserva resultados, deduplica por la identidad canónica y detiene **solo** la lista afectada.
- Un fallo de red no consume el cursor, de modo que el usuario puede reintentar.
- Volver a cargar una lista reinicia ambos historiales una vez que la nueva respuesta es vigente.
- Una respuesta de usuario/sesión anterior no cambia el estado actual; toda mutación sigue pasando por los fences y el `NetworkActionGate` existentes.
- No se cambian Auth, API, dependencias, privacidad, contratos HTTP, feature flags ni producción.

## Evidencia requerida para main

1. SHA exacto del candidato y diff limitado a cinco archivos; verificar que la base sigue siendo válida tras movimientos paralelos de `main`.
2. `pnpm test:web-network-presentation`, `pnpm --filter @losapuntes/web check:types`, formato/lint aplicables y build Web sobre Node 24/pnpm 9.15.9.
3. Contrato canónico de calidad, cobertura, runtime y auditoría de dependencias de producción sin excepciones nuevas.
4. Si las alertas HIGH #133 y #705 continúan, mantener este carrier en Draft/HOLD. Un unit test PASS no autoriza lanzamiento ni merge.

Fuente: #665 (B256). Al ser una corrección que restaura la expectativa de paginación bounded del requisito `SOC-NFR-001` y `NFR-REL-001`, no incorpora un comportamiento funcional nuevo.
