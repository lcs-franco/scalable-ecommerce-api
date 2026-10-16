FROM node:22-alpine AS base
ENV HUSKY=0
RUN corepack enable
WORKDIR /repo

# Only manifests, no sources: the dependency download stays cached until the lockfile changes
FROM base AS deps
RUN apk add --no-cache python3 make g++
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

FROM deps AS build
ARG SERVICE
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter "@ecommerce/${SERVICE}..." run build

FROM build AS dev
ARG SERVICE
ENV NODE_ENV=development
WORKDIR /repo/services/${SERVICE}
CMD ["pnpm", "run", "dev"]

# --legacy: the default deploy requires injectWorkspacePackages, which would
# change how workspace packages are linked for local development
FROM build AS deploy
ARG SERVICE
RUN pnpm --filter "@ecommerce/${SERVICE}" deploy --prod --legacy /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deploy --chown=node:node /out ./
USER node
CMD ["node", "dist/index.js"]
