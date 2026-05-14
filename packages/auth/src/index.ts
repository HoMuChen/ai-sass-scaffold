import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db, schema } from "@repo/db";

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
