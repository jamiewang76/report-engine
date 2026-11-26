import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Server-only Supabase client (service role).
 * Every query in this app MUST filter by org_id — use `forOrg()` rather than raw `db()` in report code.
 * RLS is enabled on all tables as a second wall (see supabase/migrations).
 */
let client: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!client) client = createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false } });
  return client;
}

export function forOrg(orgId: string) {
  if (!orgId) throw new Error("orgId required");
  return {
    select: (table: string, columns = "*") => db().from(table).select(columns).eq("org_id", orgId),
    upsert: (table: string, rows: Record<string, unknown>[]) =>
      db().from(table).upsert(rows.map((r) => ({ ...r, org_id: orgId }))),
    /** Delete this org's rows with these ids (chunked). */
    async deleteIds(table: string, ids: string[]) {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await db().from(table).delete().eq("org_id", orgId).in("id", ids.slice(i, i + 200));
        if (error) throw error;
      }
    },
    /**
     * Every row for this org, paged (PostgREST caps a single response at 1,000 rows by default, which would silently
     * truncate reports). Ordered by `orderBy` (a unique column) so pages are stable.
     */
    async selectAll<T = Record<string, unknown>>(table: string, columns: string, orderBy = "id", pageSize = 1000): Promise<T[]> {
      const out: T[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await db().from(table).select(columns).eq("org_id", orgId)
          .order(orderBy, { ascending: true }).range(from, from + pageSize - 1);
        if (error) throw error;
        out.push(...((data ?? []) as T[]));
        if (!data || data.length < pageSize) return out;
      }
    },
  };
}
