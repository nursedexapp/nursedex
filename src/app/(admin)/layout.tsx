import { requireAdmin } from "@/lib/auth/helpers";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  const isSuperAdmin = user.role === "super_admin";

  return (
    <div className="bg-warm-white flex min-h-screen">
      <AdminSidebar isSuperAdmin={isSuperAdmin} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
