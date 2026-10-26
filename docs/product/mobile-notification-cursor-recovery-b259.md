# B259 — Recuperación de cursores de Notificaciones Mobile

La bandeja conserva y deduplica las notificaciones recibidas al paginar. Si el
servidor repite el cursor actual o uno ya recorrido, la carga manual y la
reconciliación periódica detienen esa cadena y muestran un error explicativo.
Los fallos transitorios no consumen el cursor.

Una reconciliación completa reemplaza el historial por el de las páginas nuevas.
Si falla o pierde vigencia, conserva los datos y el historial anteriores. Así,
continuar manualmente no rechaza un cursor válido de la cadena renovada ni omite
un ciclo que empezó durante la reconciliación.

## Validación tras reconciliar con main

- 17/17 pruebas del controlador y 779/779 de la suite Mobile completa.
- La regresión de cambio de cadena fallaba antes de la corrección y ahora pasa.
- Una segunda regresión confirma la conservación del historial tras un fallo.
- TypeScript de producto y tests, Prettier afectado y git diff --check aprobados.
- La corrección del fixture de perfil (#669) ya está presente en main.

No se ejecutó ni reintentó CI. Aceptación en dispositivo nativo pendiente.
