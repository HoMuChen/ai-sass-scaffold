# syntax=docker/dockerfile:1.7
#
# Multi-stage build for apps/api. Per blueprint §5:
#   - use `turbo prune --scope=@repo/api --docker` to keep the image lean
#   - DB migrations run in a release-phase job, NEVER at container start
#
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable

# ---- Pruner: produce a workspace subset for @repo/api ------------------
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2 prune --scope=@repo/api --docker

# ---- Installer: install deps using the pruned lockfile -----------------
FROM base AS installer
WORKDIR /repo
COPY --from=pruner /repo/out/json/ ./
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- Builder -----------------------------------------------------------
FROM base AS builder
WORKDIR /repo
COPY --from=installer /repo/ ./
COPY --from=pruner /repo/out/full/ ./
RUN pnpm turbo run build --filter=@repo/api

# ---- Runner ------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner
ENV NODE_ENV=production
RUN corepack enable
WORKDIR /repo

# Copy only the workspace files needed at runtime.
COPY --from=builder /repo/ ./

EXPOSE 3000
CMD ["pnpm", "--filter", "@repo/api", "start"]
