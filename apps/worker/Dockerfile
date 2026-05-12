# syntax=docker/dockerfile:1.7
# Multi-stage build for apps/worker (BullMQ queue listener).
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2 prune --scope=@repo/worker --docker

FROM base AS installer
WORKDIR /repo
COPY --from=pruner /repo/out/json/ ./
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /repo
COPY --from=installer /repo/ ./
COPY --from=pruner /repo/out/full/ ./
RUN pnpm turbo run build --filter=@repo/worker

FROM node:${NODE_VERSION}-alpine AS runner
ENV NODE_ENV=production
RUN corepack enable
WORKDIR /repo
COPY --from=builder /repo/ ./
CMD ["pnpm", "--filter", "@repo/worker", "start"]
