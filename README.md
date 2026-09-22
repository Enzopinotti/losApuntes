# Los Apuntes

Reboot 2026 de Los Apuntes: una red universitaria mobile-first que conecta identidad académica, materias, conocimiento, personas, comunidad y oportunidades.

## Estado

El repositorio activo vive en `main`. Las ramas históricas `frontend` y `backend` son únicamente fuentes de proveniencia y no deben mergearse.

## Reglas de ingeniería

- GitHub remoto es la autoridad.
- Nada de `node_modules`, bases físicas, artefactos generados ni secretos versionados.
- El backend es la autoridad de seguridad y negocio.
- Web y mobile deberán compartir contratos; no se inventan APIs en clientes.
- La persistencia 2026 sigue abierta hasta reconciliar DER/diagramas reales.
- No se introducen microservicios ni infraestructura especulativa.
- Un PR no está listo por compilar: debe pasar el quality contract completo sobre su HEAD exacto.
- Dependencias de producción con vulnerabilidades high/critical bloquean el merge.

Ver `docs/architecture/engineering-guardrails.md`.

## Runtime y workspace

- Node 24
- pnpm 9.15.9
- workspace único para aplicaciones y futuros paquetes compartidos
- un solo `pnpm-lock.yaml` en la raíz

## Verificación local

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm audit:prod
```

`pnpm check` ejecuta higiene, formato, lint, typecheck, tests y builds.
