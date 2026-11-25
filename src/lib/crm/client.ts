import { env } from "@/lib/env";
import type { PageResult } from "./types";

/**
 * Thin CRM API client. Takes an access token (from the customer's own id4 sign-in),
 * so every call is automatically scoped to that customer's organization by the API.
 * Never use an admin / cross-tenant credential here.
 */
export class CrmClient {
  constructor(private accessToken: string, private base = env.crmApiBase) {}

  async get<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
    const url = new URL(path, this.base);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}`, Accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt)); // back off; be gentle on the CRM servers
        continue;
      }
      if (!res.ok) throw new Error(`CRM ${res.status} ${url.pathname}: ${await res.text()}`);
      return (await res.json()) as T;
    }
    throw new Error(`CRM retries exhausted for ${url.pathname}`);
  }

  /** Pages through a PageResultDto list endpoint (PageIndex is assumed 1-based — confirm in Phase 0). */
  async *paginate<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}, pageSize = 100) {
    for (let page = 1; ; page++) {
      const r = await this.get<PageResult<T>>(path, { ...params, PageIndex: page, PageSize: pageSize });
      for (const row of r.data ?? []) yield row;
      if (!r.data?.length || page >= (r.pageCount ?? page)) break;
    }
  }

  async all<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
    const out: T[] = [];
    for await (const row of this.paginate<T>(path, params)) out.push(row);
    return out;
  }
}

/** Run async tasks with limited concurrency (keeps per-job calls from hammering the API). */
export async function mapLimit<I, O>(items: I[], limit: number, fn: (item: I) => Promise<O>): Promise<O[]> {
  const out: O[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}
