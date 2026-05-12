# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**ai-sass-scaffold** — TypeScript full-stack monorepo for long-running AI agent
workloads. The architecture and constraints below come from a hand-written
blueprint; do not silently drift from them.

## Architecture

```
apps/
  web/      React SPA · Vite · Tailwind · shadcn/ui · TanStack Query
  api/      Hono · Better Auth · Zod · hono/rpc (stateless HTTP layer)
  worker/   BullMQ on Redis · runs long AI/LLM jobs
packages/
  schema/   Zod types shared between api/web/worker
  db/       Drizzle ORM + pgvector(1536) + migration runner
  storage/  S3 client + presigned URL helpers
  ai/       OpenRouter (chat) + OpenAI (embeddings) + chunking
  auth/     Better Auth instance (drizzle adapter)
```

End-to-end type safety flows: `apps/api/src/app.ts` exports `AppType` →
`apps/api/src/client.ts` builds an `hc<AppType>()` client →
`apps/web/src/lib/api.ts` consumes it. When you change a route in
`apps/api/src/routes/*`, the web client picks up the new types automatically.

## Strict rules (do not break)

1. **No file bytes through the API.** Uploads use presigned PUT URLs
   (`POST /uploads/presign`, `packages/storage`). Do not add an endpoint
   that streams or buffers user file bodies through `apps/api`.
2. **No runtime migrations.** `drizzle-kit push` must never run at API or
   worker container startup. Migrations apply in a CD release-phase job via
   `packages/db/src/migrate.ts`. Generated SQL lives in `packages/db/drizzle/`
   and must be committed to git (CI checks this).
3. **Long-running AI work goes to the worker.** API handlers stay short:
   they validate, write the run record, enqueue, and return. The HTTP layer
   does not block on LLM calls.
4. **Embedding dimension is 1536.** It matches `text-embedding-3-small`.
   Changing it requires a coordinated update in
   `packages/db/src/schema.ts` (`vector("embedding", { dimensions: 1536 })`)
   and `packages/ai/src/embeddings.ts` (`EMBEDDING_DIMENSIONS`).
5. **Docker images use `turbo prune`.** Per-app Dockerfiles must keep the
   `pruner → installer → builder → runner` stages — never `COPY . .` into
   the runtime image.

## Conventions

- **Package names** use the `@repo/*` scope (`@repo/db`, `@repo/api`, ...).
- **TypeScript** is ESM (`"type": "module"`) everywhere; imports inside the
  monorepo carry the `.js` extension even when the source is `.ts` — this is
  required by the strict module resolution mode in `tsconfig.base.json`.
- **Zod schemas** for API request/response bodies belong in `packages/schema`,
  not inside `apps/api/src/routes`. Routes import them and validate with
  `@hono/zod-validator`.
- **Env vars** are validated at the place of first use with a small
  `requireEnv` helper. The canonical list lives in `.env.example` and the
  `globalEnv` field of `turbo.json`.
- **Database access** goes through the Drizzle `db` exported from
  `@repo/db` — never construct a second `postgres()` client.
- **Queue jobs** are typed by `agentJobPayloadSchema` in `@repo/schema`. The
  worker re-parses with Zod before dispatching to a handler.

## Common commands

```bash
pnpm install
pnpm docker:up          # Postgres+pgvector, Redis, MinIO
pnpm dev                # turbo dev — runs web + api + worker
pnpm typecheck
pnpm lint
pnpm db:generate        # produce a new drizzle migration after schema edits
pnpm db:migrate         # apply migrations (this is what CD runs in release phase)
pnpm db:studio
```

Single-package commands use pnpm filters:

```bash
pnpm --filter @repo/api dev
pnpm --filter @repo/worker build
```

## Adding things

- **New API route** → create file in `apps/api/src/routes/`, mount it in
  `app.ts` with `.route("/path", ...)`. The new endpoints are immediately
  callable from the web client with full types.
- **New DB table** → edit `packages/db/src/schema.ts`, run
  `pnpm db:generate`, commit the generated SQL in `packages/db/drizzle/`.
- **New agent** → add a handler under `apps/worker/src/agents/<name>.ts` and
  register it in `apps/worker/src/agents/index.ts`. The API enqueues by
  setting `body.agent` to that name.
- **New shared type** → add to `packages/schema/src/<topic>.ts` and re-export
  from `index.ts`.

## Things to avoid

- Importing `@repo/db` from `apps/web` — the web app is browser-only; DB
  access goes through the API.
- Adding `node:*` imports to anything under `packages/schema` — that package
  must stay isomorphic so the web bundle can consume it.
- Calling `drizzle-kit push` against a real database. Always go through
  generate → review SQL → migrate.
- Hand-editing files under `packages/db/drizzle/` (drizzle-kit owns them).

## Local infra ports

| Service     | URL                              | Credentials              |
| ----------- | -------------------------------- | ------------------------ |
| Web (Vite)  | http://localhost:5173            | —                        |
| API (Hono)  | http://localhost:3000            | —                        |
| Postgres    | localhost:5432 · db `app`        | postgres / postgres      |
| Redis       | localhost:6379                   | —                        |
| MinIO API   | http://localhost:9000            | minioadmin / minioadmin  |
| MinIO UI    | http://localhost:9001            | minioadmin / minioadmin  |
