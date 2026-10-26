# Avatares de personas en la red Mobile

Los resultados de personas de Search, la lista de perfiles seguidos y las
solicitudes/conexiones muestran el avatar público al lado del nombre. Una
inicial conserva la identidad visual cuando no hay URL o la imagen no carga.

Mobile solo solicita imágenes con URL HTTPS válida, sin credenciales ni
espacios externos y dentro del límite de 2048 caracteres. El avatar es
decorativo para tecnologías de asistencia; los nombres y acciones existentes
siguen proporcionando las etiquetas accesibles.

La prueba de política y cableado de las tres pantallas corre dentro de
`pnpm --filter @losapuntes/mobile test`.

## Revisión tras reconciliar con main

Se conservaron los cambios de Search (retorno, guardado en colecciones y compartir)
y los controladores actuales. La corrección del fixture de perfil de #669 ya
está presente, por lo que no queda diferencia de fixture respecto de main.

La suite Mobile completa pasa: 781/781. TypeScript de producto y pruebas pasa
contra los contratos fuente actuales y tipos reales de expo-image-picker 57.0.20.
Prettier afectado y git diff --check pasan. No se repitió export nativo ni
aceptación en dispositivo sobre este head. Sin ejecutar ni reintentar CI.
