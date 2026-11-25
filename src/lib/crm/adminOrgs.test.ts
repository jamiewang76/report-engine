import { afterEach, describe, expect, it, vi } from "vitest";

process.env.CRM_API_BASE = "https://crm.example";
const { getCrmOrg, searchCrmOrgs, OrgSearchUnavailable } = await import("./adminOrgs");

afterEach(() => vi.unstubAllGlobals());

describe("CRM org lookup for admins", () => {
  it("exact org id uses GET /ups/api/Organizations/{id} with the admin's own token", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "1080628972007456768", name: "Measure It All" })));
    vi.stubGlobal("fetch", f);
    expect(await searchCrmOrgs("admin-token", " 1080628972007456768 ")).toEqual([{ id: "1080628972007456768", name: "Measure It All" }]);
    expect(String(f.mock.calls[0][0])).toBe("https://crm.example/ups/api/Organizations/1080628972007456768");
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer admin-token");
  });

  it("unknown id => no result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    expect(await getCrmOrg("t", "999999999")).toBeNull();
  });

  it("keyword search reports clearly that it isn't wired yet (no guessing at endpoints)", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(searchCrmOrgs("t", "tile")).rejects.toBeInstanceOf(OrgSearchUnavailable);
    expect(f).not.toHaveBeenCalled();
  });
});
