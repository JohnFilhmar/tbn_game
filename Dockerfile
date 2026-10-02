# One image for both process types (web and worker) and for one-off commands such as the
# migration release step. Base images are pinned by digest; Dependabot proposes updates.

FROM node:24.21.0-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe AS node_build

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:9eeb7f5887d0e239e78264b06f7f11d2e14be534050481803a9e4728fcdd278e AS node_runtime

# Every dependency, for compiling.
FROM node_build AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY packages/contracts/package.json packages/contracts/
COPY backend/package.json backend/
RUN npm ci --no-audit --ignore-scripts

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY backend backend
RUN npm run build \
  && mkdir -p /app/runtime_dirs/workspace

# Production dependencies only. Prisma's approved install script fetches the schema engine that
# `prisma migrate deploy` runs in the release step.
FROM node_build AS prod_deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY packages/contracts/package.json packages/contracts/
COPY backend/package.json backend/
RUN npm ci --omit=dev --no-audit

# Distroless runtime: no shell, no package manager, runs as uid 65532.
FROM node_runtime AS runtime
LABEL org.opencontainers.image.source="https://github.com/JohnFilhmar/tbn_game" \
      org.opencontainers.image.description="tbn_game backend: web and worker process types"
ENV NODE_ENV=production
WORKDIR /app/backend
COPY --from=prod_deps /app/node_modules /app/node_modules
COPY --from=build /app/packages/contracts/package.json /app/packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist /app/packages/contracts/dist
COPY --from=build /app/backend/package.json /app/backend/prisma.config.ts ./
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/dist ./dist
COPY --from=build --chown=65532:65532 /app/runtime_dirs/workspace /workspace
ARG GIT_COMMIT_SHA=unknown
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}
USER 65532:65532
EXPOSE 3000 3001
CMD ["dist/web.js"]
