import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { randomUUID } from "node:crypto";
import { db, schema } from "@repo/db";
import { provisionPersonalOrganization } from "./personal-organization.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required`);
  return v;
}

/**
 * Single Better Auth instance shared by api (handler) and worker / scripts
 * (server-side session reads). Blueprint §3 packages/auth.
 */
export const auth = betterAuth({
  secret: requireEnv("BETTER_AUTH_SECRET"),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await provisionPersonalOrganization(
            {
              id: user.id,
              email: user.email,
              name: user.name,
            },
            {
              findOrganizationBySlug: async (slug) => {
                const organization = await db.query.organization.findFirst({
                  where: (organization, { eq }) => eq(organization.slug, slug),
                });
                return organization ?? null;
              },
              insertOrganization: async ({ name, slug }) => {
                const [organization] = await db
                  .insert(schema.organization)
                  .values({ id: randomUUID(), name, slug })
                  .returning();
                if (!organization) throw new Error("failed to create personal organization");
                return organization;
              },
              insertMember: async ({ organizationId, userId, role }) => {
                await db
                  .insert(schema.member)
                  .values({ id: randomUUID(), organizationId, userId, role });
              },
              insertOrganizationProfile: async ({ organizationId, displayName }) => {
                await db.insert(schema.organizationProfiles).values({ organizationId, displayName });
              },
            },
          );
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          // Pick a deterministic fallback org for first-time sessions when a user
          // already belongs to multiple organizations.
          const membership = await db.query.member.findFirst({
            where: (member, { eq }) => eq(member.userId, session.userId),
            orderBy: (member, { asc }) => [asc(member.createdAt), asc(member.id)],
          });

          return {
            data: {
              ...session,
              activeOrganizationId: membership?.organizationId ?? null,
            },
          };
        },
      },
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  plugins: [
    organization({
      schema: {
        session: {
          fields: {
            activeOrganizationId: "activeOrganizationId",
            activeTeamId: "activeTeamId",
          },
        },
      },
      organizationHooks: {
        afterCreateOrganization: async ({ organization }) => {
          await db.insert(schema.organizationProfiles).values({
            organizationId: organization.id,
            displayName: organization.name,
          }).onConflictDoNothing({
            target: schema.organizationProfiles.organizationId,
          });
        },
      },
    }),
  ],
  trustedOrigins: (process.env.API_CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
});

export type Auth = typeof auth;
export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;
