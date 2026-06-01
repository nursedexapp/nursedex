import { requireAdmin } from "@/lib/auth/helpers";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { getAdminCounts } from "@/lib/admin/queries";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  const isSuperAdmin = user.role === "super_admin";
  const counts = await getAdminCounts();

  return (
    <div className="bg-warm-white flex min-h-screen">
      <AdminSidebar isSuperAdmin={isSuperAdmin} counts={counts} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
