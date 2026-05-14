import { describe, expect, it, vi } from "vitest";
import { provisionPersonalOrganization } from "./personal-organization.js";

describe("provisionPersonalOrganization", () => {
  it("creates a personal organization, owner membership, and profile for a new user", async () => {
    const findOrganizationBySlug = vi.fn(async () => null);
    const insertOrganization = vi.fn(async (input: { name: string; slug: string }) => ({
      id: "org_1",
      ...input,
    }));
    const insertMember = vi.fn(async () => undefined);
    const insertOrganizationProfile = vi.fn(async () => undefined);

    const result = await provisionPersonalOrganization(
      {
        id: "user_1",
        email: "alice@example.com",
        name: "Alice",
      },
      {
        findOrganizationBySlug,
        insertOrganization,
        insertMember,
        insertOrganizationProfile,
      },
    );

    expect(result).toEqual({
      id: "org_1",
      name: "Alice's Workspace",
      slug: "alice-workspace",
    });
    expect(findOrganizationBySlug).toHaveBeenCalledWith("alice-workspace");
    expect(insertOrganization).toHaveBeenCalledWith({
      name: "Alice's Workspace",
      slug: "alice-workspace",
    });
    expect(insertMember).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: "user_1",
      role: "owner",
    });
    expect(insertOrganizationProfile).toHaveBeenCalledWith({
      organizationId: "org_1",
      displayName: "Alice's Workspace",
    });
  });

  it("adds a suffix when the base slug is already taken", async () => {
    const findOrganizationBySlug = vi
      .fn()
      .mockResolvedValueOnce({ id: "org_existing", slug: "alice-workspace" })
      .mockResolvedValueOnce(null);

    const insertOrganization = vi.fn(async (input: { name: string; slug: string }) => ({
      id: "org_2",
      ...input,
    }));

    const result = await provisionPersonalOrganization(
      {
        id: "user_2",
        email: "alice@example.com",
        name: "Alice",
      },
      {
        findOrganizationBySlug,
        insertOrganization,
        insertMember: vi.fn(async () => undefined),
        insertOrganizationProfile: vi.fn(async () => undefined),
      },
    );

    expect(result.slug).toBe("alice-workspace-2");
    expect(findOrganizationBySlug).toHaveBeenNthCalledWith(1, "alice-workspace");
    expect(findOrganizationBySlug).toHaveBeenNthCalledWith(2, "alice-workspace-2");
  });
});
