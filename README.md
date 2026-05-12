# ai-sass-scaffold

TypeScript full-stack monorepo for long-running AI agent workloads. End-to-end
type safety, container-first deployment, Postgres + pgvector + Redis + S3.

## Stack

| Layer        | Choice                                                       |
| ------------ | ------------------------------------------------------------ |
| Monorepo     | pnpm workspaces + Turborepo                                  |
| Frontend     | React SPA · Vite · Tailwind · shadcn/ui · TanStack Query     |
| API          | Hono · `hono/rpc` end-to-end types · Better Auth · Zod       |
| Worker       | BullMQ on Redis · LangGraph-ready agent registry             |
| DB           | PostgreSQL + pgvector (1536-dim) · Drizzle ORM               |
| Storage      | S3-compatible (R2 in prod, MinIO locally) · presigned PUT    |
| AI           | OpenRouter (chat) · OpenAI (embeddings)                      |

## Layout

```
apps/
  web/      React SPA
  api/      Hono API (stateless)
  worker/   BullMQ queue listener
packages/
  db/       Drizzle schema + migrations (pgvector)
  schema/   Zod types shared by api/web/worker
  storage/  S3 client + presigned URL helpers
  ai/       OpenRouter / OpenAI / chunking
  auth/     Better Auth instance
```

## Quickstart

```bash
# 1. Install deps
pnpm install

# 2. Boot local infra (Postgres+pgvector, Redis, MinIO)
cp .env.example .env
pnpm docker:up

# 3. Generate and apply migrations
pnpm db:generate
pnpm db:migrate

# 4. Run everything (api + worker + web) via turbo
pnpm dev
```

Web:    http://localhost:5173
API:    http://localhost:3000  (health: `/health`)
MinIO:  http://localhost:9001  (minioadmin / minioadmin)

## Strict rules from the blueprint

- **No file-bytes through the API.** Frontend uploads go directly to S3 using
  presigned PUT URLs — see `packages/storage` and `POST /uploads/presign`.
- **No runtime migrations.** `drizzle-kit push` is never invoked at API start.
  Migrations run in a CD release-phase job using `packages/db` `db:migrate`.
- **Dockerized PaaS, not pure Serverless.** Long agent jobs run in the worker
  container; HTTP requests stay short.
- **Turbo prune for Docker.** Per-app Dockerfiles use
  `turbo prune --scope=@repo/<app> --docker` to minimise image size.

## Common commands

```bash
pnpm dev               # turbo dev (all apps)
pnpm build             # turbo build
pnpm typecheck         # turbo typecheck
pnpm lint              # turbo lint
pnpm db:generate       # produce a new drizzle migration
pnpm db:migrate        # apply migrations (RUN IN RELEASE PHASE in prod)
pnpm db:studio         # drizzle studio
pnpm docker:up         # start local Postgres / Redis / MinIO
pnpm docker:down       # stop containers
```

## Deployment

API and worker are designed for container PaaS (Railway / Render / Fly.io):

```bash
docker build -f apps/api/Dockerfile    -t myorg/api:latest    .
docker build -f apps/worker/Dockerfile -t myorg/worker:latest .
```

Release phase (run BEFORE rolling new containers):

```bash
DATABASE_URL=... pnpm --filter @repo/db db:migrate
```

The web app deploys as a static bundle (`pnpm --filter @repo/web build`) to
Vercel or Cloudflare Pages.
