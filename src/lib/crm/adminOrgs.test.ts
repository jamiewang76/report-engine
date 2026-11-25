import { afterEach, describe, expect, it, vi } from "vitest";

process.env.CRM_API_BASE = "https://crm.example";
const { getCrmOrg, searchCrmOrgs, OrgSearchUnavailable } = await import("./adminOrgs");

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("CRM org search for admins", () => {
  it("calls the admin org list endpoint with the keyword and the admin's own token", async () => {
    const f = vi.fn().mockResolvedValue(json({ data: [{ id: "1", name: "Flooring Foundation" }], pageCount: 1 }));
    vi.stubGlobal("fetch", f);
    expect(await searchCrmOrgs("admin-token", " Flooring Foundation ")).toEqual([{ id: "1", name: "Flooring Foundation" }]);
    const url = new URL(String(f.mock.calls[0][0]));
    expect(url.pathname).toBe("/ups/api/admin/organizations");
    expect(Object.fromEntries(url.searchParams)).toEqual({ pageIndex: "1", pageSize: "25", orderBy: "lastActiveTime DESC", name: "Flooring Foundation" });
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer admin-token");
  });

  it("accepts the common response wrappers and field names", async () => {
    for (const body of [
      [{ id: "1", name: "A" }],
      { items: [{ organizationId: "1", organizationName: "A" }] },
      { data: { data: [{ id: 1, name: "A" }], totalCount: 1 } },
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(body)));
      expect(await searchCrmOrgs("t", "a")).toEqual([{ id: "1", name: "A" }]);
    }
  });

  it("an all-digits query also matches an exact org id", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: URL) =>
      u.pathname.startsWith("/ups/api/admin/") ? json({ data: [] }) : json({ id: "1080628972007456768", name: "Measure It All" })));
    expect(await searchCrmOrgs("t", "1080628972007456768")).toEqual([{ id: "1080628972007456768", name: "Measure It All" }]);
  });

  it("a non-super CRM user gets a clear message, not a crash", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 403)));
    await expect(searchCrmOrgs("t", "tile")).rejects.toBeInstanceOf(OrgSearchUnavailable);
  });

  it("unknown org id => null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    expect(await getCrmOrg("t", "999999999")).toBeNull();
  });
});
