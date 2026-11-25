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
  };
}
