FROM node:24.20.0-bookworm-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack install --global pnpm@9.15.9

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile --filter @losapuntes/api...

COPY apps/api apps/api

RUN pnpm --filter @losapuntes/api build

FROM node:24.20.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack install --global pnpm@9.15.9

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile --prod --filter @losapuntes/api...

COPY --from=build /workspace/apps/api/dist apps/api/dist

WORKDIR /workspace/apps/api

EXPOSE 4000

USER node

CMD ["node", "dist/main.js"]
