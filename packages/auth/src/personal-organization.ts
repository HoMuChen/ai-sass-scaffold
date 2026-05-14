type PersonalOrganizationUser = {
  id: string;
  email: string;
  name?: string | null;
};

type PersonalOrganizationRecord = {
  id: string;
  name: string;
  slug: string;
};

export type PersonalOrganizationDeps = {
  findOrganizationBySlug: (slug: string) => Promise<{ id: string; slug: string } | null>;
  insertOrganization: (input: {
    name: string;
    slug: string;
  }) => Promise<PersonalOrganizationRecord>;
  insertMember: (input: {
    organizationId: string;
    userId: string;
    role: string;
  }) => Promise<void>;
  insertOrganizationProfile: (input: {
    organizationId: string;
    displayName: string;
  }) => Promise<void>;
};

function slugifySegment(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "workspace";
}

export function getPersonalOrganizationName(user: PersonalOrganizationUser): string {
  const display = user.name?.trim() || user.email.split("@")[0] || "User";
  return `${display}'s Workspace`;
}

export function getPersonalOrganizationBaseSlug(user: PersonalOrganizationUser): string {
  const preferred = user.name?.trim() || user.email.split("@")[0] || "workspace";
  return `${slugifySegment(preferred)}-workspace`;
}

export async function provisionPersonalOrganization(
  user: PersonalOrganizationUser,
  deps: PersonalOrganizationDeps,
): Promise<PersonalOrganizationRecord> {
  const name = getPersonalOrganizationName(user);
  const baseSlug = getPersonalOrganizationBaseSlug(user);

  for (let index = 0; index < 100; index += 1) {
    const slug = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    const existing = await deps.findOrganizationBySlug(slug);
    if (existing) continue;

    const organization = await deps.insertOrganization({ name, slug });
    await deps.insertMember({
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
    });
    await deps.insertOrganizationProfile({
      organizationId: organization.id,
      displayName: organization.name,
    });
    return organization;
  }

  throw new Error(`Unable to allocate personal organization slug for user ${user.id}`);
}
