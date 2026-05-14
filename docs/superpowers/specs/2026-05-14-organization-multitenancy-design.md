# Organization Multitenancy Design

## Goal

Evolve this scaffold from a user-scoped single-tenant model into an organization-scoped multi-tenant model that:

- uses Better Auth's `organization` plugin and naming consistently
- supports multiple users in the same organization
- scopes shared business data by `organizationId`
- keeps `userId` for audit and actor attribution, not data visibility

This design intentionally avoids a parallel `tenant` abstraction. The auth layer and domain layer both use `organization`.

## Current State

The current scaffold is user-scoped:

- API auth middleware resolves only `userId` and `userEmail`
- `uploads`, `agent_runs`, and `documents` are owned by `userId`
- API list/detail queries filter by `userId`
- Better Auth is configured only for base user/session/account tables

This is correct for a single-user prototype, but not for shared organization data.

## Decision Summary

We will adopt Better Auth's organization model directly and reshape the scaffold around it.

Core decisions:

- Use Better Auth `organization` plugin for organizations, memberships, active organization, invitations, and roles
- Use `organizationId` consistently across auth and business tables
- Keep `users` global and not directly bound to a single organization
- Change business data visibility boundaries from `userId` to `organizationId`
- Keep actor identity on records via audit fields such as `createdByUserId` and `triggeredByUserId`
- Add a domain-owned organization companion table for future SaaS settings/profile data

## Data Model

### Auth-owned identity and organization data

These are managed by Better Auth and its organization plugin:

- `users`
- `sessions`
- `accounts`
- `verifications`
- `organizations`
- `memberships`
- organization role and invitation tables added by the plugin as needed

`users` remains a global identity table. A user may belong to multiple organizations through memberships.

### Domain-owned organization data

Add a domain table keyed by organization identity:

- `organization_profiles`

Initial purpose:

- hold SaaS-owned organization metadata not owned by Better Auth
- provide a stable extension point for future billing, branding, quotas, and settings

Suggested shape:

- `organization_id` primary key and foreign key to Better Auth organization
- `display_name`
- `slug_snapshot` if the app wants a domain-side copy
- `created_at`
- `updated_at`
- optional `metadata`

This table is intentionally minimal in the scaffold.

### Business tables

All shared business tables become organization-scoped.

#### `uploads`

Change from:

- `user_id`

To:

- `organization_id`
- `created_by_user_id`

Semantics:

- visibility and ownership are determined by `organization_id`
- creator attribution is stored in `created_by_user_id`

#### `agent_runs`

Change from:

- `user_id`

To:

- `organization_id`
- `triggered_by_user_id`

Semantics:

- a run belongs to one organization
- any authorized member of that organization may view it
- the user who started the run is preserved in `triggered_by_user_id`

#### `documents`

Change from:

- `user_id`

To:

- `organization_id`
- `created_by_user_id`

#### `document_chunks`

Keep `document_id` as the main ownership chain.

For the scaffold, do not duplicate `organization_id` onto `document_chunks` yet. Organization membership can be resolved through the parent document. If future search workloads need tighter organization-level filtering for performance, denormalizing `organization_id` onto chunks can be introduced later.

## Naming Rules

Use Better Auth naming directly:

- `organization`
- `organizationId`
- `membership`
- `role`

Do not mix in `tenant`, `workspace`, or `account` as parallel concepts in schema or API contracts.

## Authorization Model

Separate data visibility from action permissions.

### Visibility boundary

`organizationId` determines which records are visible in the request.

Examples:

- `GET /agents/runs` returns runs for the current organization
- `GET /agents/runs/:id` finds the run by `id` and `organizationId`
- upload download access is validated against the current organization

### Permission boundary

The organization membership role determines whether the current user may perform a specific action.

Initial role model:

- `owner`
- `admin`
- `member`

This aligns with Better Auth organization defaults and avoids inventing a custom role system in the scaffold.

## Request Context

The current API middleware only exposes:

- `userId`
- `userEmail`

It must be expanded to resolve organization-aware context:

- `userId`
- `userEmail`
- `organizationId`
- `organizationRole` or an equivalent permission-check capability

Behavioral rules:

- organization-scoped routes require an authenticated user and an active organization
- requests without an active organization are rejected
- the active organization must be one the user belongs to

## API Changes

### Auth middleware

Update auth middleware to:

- load the session
- resolve the active organization from Better Auth
- resolve membership/role for the active organization
- attach organization context to Hono variables

### Agent routes

Change route behavior:

- `POST /agents/runs` inserts `organizationId` and `triggeredByUserId`
- `GET /agents/runs/:id` filters by `id + organizationId`
- `GET /agents/runs` lists organization runs, not user runs

### Upload routes

Change route behavior:

- `POST /uploads/presign` writes `organizationId` and `createdByUserId`
- S3 object keys include the organization namespace
- `GET /uploads/download` validates the requested key belongs to the current organization before issuing a signed URL

Suggested storage key pattern:

- `orgs/{organizationId}/uploads/{uploadId-or-random}/{filename}`

This keeps storage structure aligned with data ownership and simplifies cleanup/export workflows.

## Role and Permission Handling

The scaffold should begin with the default Better Auth organization roles.

Initial route-level expectations:

- `member`
  - can read organization data
  - can create low-risk records like uploads or standard agent runs if allowed by product policy
- `admin`
  - can perform organization management actions
  - can manage higher-risk operations if introduced later
- `owner`
  - retains full organization control per Better Auth defaults

The scaffold does not need a custom fine-grained permission matrix yet. It should, however, structure route guards so that custom permissions can be introduced later without changing the data model.

## Migration Strategy

This repository is a scaffold and can take the clean path:

- directly modify schema definitions
- replace the initial migration rather than preserve a user-scoped history

Implications:

- no backfill migration is required
- no transitional nullable `organization_id` columns are required
- no compatibility layer for old `userId` visibility semantics is required

Concrete migration work:

- add Better Auth organization plugin tables to schema/migrations
- add `organization_profiles`
- replace user-scoped ownership columns on business tables
- replace relevant indexes

## Indexing

Add or update indexes to match organization-scoped reads:

- `uploads.organization_id_idx`
- `agent_runs.organization_id_idx`
- `agent_runs(organization_id, created_at)` composite index
- `documents.organization_id_idx`

Retain global uniqueness for opaque storage keys if desired, but scope path prefixes by organization for operational clarity.

## Error Handling

Organization-aware API behavior should use explicit failures:

- unauthenticated request: `401`
- authenticated but no active organization: `400` or `403` depending on route semantics
- authenticated but not a member of the active organization: `403`
- record not found within current organization scope: `404`

Avoid leaking cross-organization existence. If a record exists in another organization, the API should still return `404` when queried from the wrong organization context.

## Testing Strategy

Minimum coverage for the implementation phase:

- auth middleware resolves active organization context
- requests fail without active organization context
- organization-scoped list/detail queries return only current organization data
- users in the same organization can view shared records
- users in different organizations cannot access each other's records
- role-gated endpoints reject insufficient roles
- upload key generation includes organization scoping

## Non-Goals

This design does not include:

- row-level security in Postgres
- schema-per-tenant or database-per-tenant isolation
- a custom ACL system beyond Better Auth organization roles
- per-record sharing rules inside an organization
- cross-organization switcher UX details beyond relying on Better Auth active organization semantics

## Recommended Implementation Order

1. Add Better Auth organization plugin and schema support
2. Reshape DB schema to organization-scoped business tables
3. Update auth middleware to resolve active organization context
4. Update API routes to filter by `organizationId`
5. Update storage key generation to include organization scoping
6. Add minimal tests for cross-organization isolation and same-organization sharing
7. Add optional `organization_profiles` usage where the scaffold needs domain-owned organization metadata

## Open Tradeoff Chosen Intentionally

We are not using a simplified `users.organization_id` model.

That approach would be easier in the short term, but it conflicts with the explicit requirement to support multiple users with different roles inside the same organization and would force a later rewrite into memberships. Using Better Auth's organization model now avoids that rework and keeps naming consistent across the stack.
