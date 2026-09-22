# Los Apuntes

Reboot 2026 de Los Apuntes: una red universitaria mobile-first que conecta identidad académica, materias, conocimiento, personas, comunidad y oportunidades.

## Estado

Este repositorio está en una fase de rescate controlado. Las ramas históricas `frontend` y `backend` son fuentes de código, no ramas mergeables.

Proveniencia congelada para el rescate inicial:

- frontend: `4d481ad922bfed8ce4dbc6418a5111cfd6daefe0`
- backend: `51b67bb71c4ec03d9b94963fc139695140c5563d`
- main base: `5c0e677c7c8b6f8d5b774aae8b094ae128748292`

## Reglas de ingeniería

- GitHub remoto es la autoridad.
- Nada de `node_modules`, bases físicas, artefactos generados ni secretos versionados.
- El backend es la autoridad de seguridad y negocio.
- Web y mobile deberán compartir contratos; no se inventan APIs en clientes.
- La persistencia 2026 sigue abierta hasta reconciliar DER/diagramas reales.
- No se introducen microservicios ni infraestructura especulativa.
- Un PR no está listo por compilar: debe pasar higiene, lint, tests y builds desde un checkout limpio.

Ver `docs/architecture/engineering-guardrails.md`.

## Verificación local del baseline

Requiere Node 24.

```bash
npm run install:all
npm run check
```

El rescate mantiene temporalmente los lockfiles npm de cada aplicación para verificar primero los artefactos históricos de forma reproducible. La convergencia a un package manager/workspace único se hará en un cambio separado después del primer baseline verde.
