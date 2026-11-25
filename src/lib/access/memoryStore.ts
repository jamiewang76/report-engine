import type { AccessStore, ActiveAssignment, EventAction, NewEvent } from "./store";

/** In-memory AccessStore with the same semantics as supabaseStore. Test-only. */
export function memoryStore() {
  const orgs = new Map<string, { name: string; first_seen_at: Date | null; last_seen_at: Date | null }>();
  const users = new Map<string, { email: string | null; name: string | null; first_seen_at: Date; last_seen_at: Date }>();
  const assignments: (ActiveAssignment & { revokedAt: Date | null })[] = [];
  const superAdmins = new Set<string>();
  const events: (NewEvent & { createdAt: Date })[] = [];
  let nextId = 1;

  const store: AccessStore = {
    async activeAssignments(orgId) {
      return assignments.filter((a) => a.orgId === orgId && !a.revokedAt).map(({ revokedAt: _r, ...a }) => a);
    },
    async isListedSuperAdmin(userId) {
      return superAdmins.has(userId);
    },
    async upsertOrganization(orgId, name, now) {
      const o = orgs.get(orgId);
      if (!o) orgs.set(orgId, { name: name ?? orgId, first_seen_at: now, last_seen_at: now });
      else orgs.set(orgId, { ...o, name: name ?? o.name, first_seen_at: o.first_seen_at ?? now, last_seen_at: now });
    },
    async upsertOrgUser(u, now) {
      const k = `${u.orgId}|${u.userId}`;
      const prev = users.get(k);
      users.set(k, { email: u.email, name: u.name, first_seen_at: prev?.first_seen_at ?? now, last_seen_at: now });
    },
    async insertEvent(e) {
      events.push({ ...e, createdAt: new Date() });
    },
    async hasEventSince(orgId, userId, action: EventAction, since) {
      return events.some((e) => e.orgId === orgId && e.userId === userId && e.action === action && e.createdAt >= since);
    },
  };

  return {
    store, orgs, users, events, superAdmins,
    /** Org added from the admin console before anyone signed in. */
    addByAdmin(orgId: string, name: string) {
      orgs.set(orgId, { name, first_seen_at: null, last_seen_at: null });
    },
    assign(orgId: string, reportId: string, config: Record<string, unknown> = {}) {
      const a = { id: nextId++, orgId, reportId, config, revokedAt: null as Date | null };
      assignments.push(a);
      return a;
    },
    revoke(orgId: string, reportId: string) {
      for (const a of assignments) if (a.orgId === orgId && a.reportId === reportId && !a.revokedAt) a.revokedAt = new Date();
    },
  };
}
