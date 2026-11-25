import { requireSuperAdminPage } from "@/lib/admin/guard";
import AppHeader from "../components/AppHeader";

export const dynamic = "force-dynamic";

/** Chrome only. Each admin page ALSO calls requireSuperAdminPage(): layouts are not a security boundary. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSuperAdminPage();
  return (
    <>
      <AppHeader session={s} active="admin" />
      <main style={{ maxWidth: 1100, margin: "28px auto", padding: "0 24px" }}>{children}</main>
    </>
  );
}
