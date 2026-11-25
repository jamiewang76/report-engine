import { afterEach, describe, expect, it, vi } from "vitest";

process.env.CRM_API_BASE = "https://crm.example";
const { fetchUserOrgs, switchOrgToken } = await import("./orgs");

// Unsigned test JWT with the given claims (decodeJwt does not verify signatures).
const jwt = (claims: object) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const token = jwt({ sub: "91477", userId: "u1", currentOrganizationId: "o1", currentOrganizationName: "Org One" });

afterEach(() => vi.unstubAllGlobals());

describe("fetchUserOrgs", () => {
  it("reads organizations from the UPS user record (CRM userId claim, not sub), sorted by name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ organizations: [{ id: "o2", name: "Zeta" }, { id: "o1", name: "Alpha" }] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchUserOrgs(token)).toEqual([{ id: "o1", name: "Alpha" }, { id: "o2", name: "Zeta" }]);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://crm.example/ups/api/users/u1");
  });

  it("returns null when the list can't be read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 403 })));
    expect(await fetchUserOrgs(token)).toBeNull();
  });
});

describe("switchOrgToken", () => {
  it("returns the token for the requested org", async () => {
    const next = jwt({ currentOrganizationId: "o2" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: next }))));
    expect(await switchOrgToken(token, "o2")).toBe(next);
  });

  it("rejects a token scoped to a different org", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: jwt({ currentOrganizationId: "o3" }) }))));
    await expect(switchOrgToken(token, "o2")).rejects.toThrow(/different organization/);
  });

  it("surfaces the CRM error when the user isn't a member", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant", error_description: "Not a member" }), { status: 400 })));
    await expect(switchOrgToken(token, "o9")).rejects.toThrow("Not a member");
  });
});
