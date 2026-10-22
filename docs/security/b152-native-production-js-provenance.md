# B152 — Evidencia del JavaScript nativo exportado (iOS y Android)

**Fecha:** 2026-10-20. **Base inicial:** main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9.
**Ámbito:** validación técnica de distribución JS. No cambia producto, versiones, lockfile, Expo config, excepciones ni permisos.

## Motivación

Los avisos GHSA-86w9-cpqp-85rv (node-forge@1.4.0, #133) y GHSA-vfj7-8cjw-p6xm (braces@3.0.3, #141) persisten sin release corregido confirmado. El production audit sigue FAIL. B142 acredita ambos paquetes dentro del tooling Expo/Metro de apps/mobile, pero este grafo no demuestra qué módulos JS terminan en los dispositivos.

Expo documenta la exportación nativa con mapas y sin bytecode, mediante las opciones --platform ios/android --source-maps --no-bytecode. La exportación transforma rutas y minimiza código: buscar cadenas en un bundle no prueba la atribución de módulos. Los mapas sí permiten atribuir el código a sus fuentes.

## Contrato B152

- En HEAD exacto, Node 24, pnpm 9.15.9 y lockfile frozen, exportar iOS y Android por separado con sourcemaps, sin EAS, firma ni publicación.
- Recorrer todas las fuentes de mapas JS/bytecode nativos exportados y detectar rutas exactas de node-forge o braces originadas desde node_modules o carpetas pnpm virtuales. Evitar falsos positivos de braces-helper.
- Fallar cerrado ante mapa ausente, ruta inválida, symlink, versión de mapa distinta de 3, lista de módulos vacía, recursos excesivos, falta de módulos de terceros o cualquiera de estos paquetes en iOS o Android.
- La salida mínima contiene conteos y nombres de paquetes expuestos. Los mapas quedan temporales en runner: no se suben como artefactos, ni se incorporan al repositorio.
- La salida declara productionAuditCertified:false y releaseAuthorized:false incluso si ambos bundles están limpios. Esto prueba presencia/ausencia de módulos JS en **esas dos exportaciones**, no certifica la seguridad de Metro build-time, toolchains de firma, Gradle, CocoaPods o la cadena de suministro.
- El test cubre rutas pnpm, sourceRoot, contaminación asimétrica, mapas ausentes, falta de terceros, errores de formato, symlinks y layouts variables de Expo.

## Política de release

El comando obligatorio pnpm audit --prod --audit-level high en .github/workflows/ci.yml sigue intacto y bloqueante. Los issues #133/#141 y el release #353 siguen HOLD aunque este control pase. Sin excepciones, overrides no revisados, forks no auditados, upgrades inventados ni merge/deploy por un check aislado.

Una remediación futura requiere publicación upstream revisada o eliminación total de las dependencias afectadas del grafo auditado, lockfile reproducible, QA Mobile nativo real, auditoría exact-head verde y aceptación de #353.
