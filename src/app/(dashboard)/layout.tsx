import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-warm-white">
      <DashboardSidebar />
      <main className="flex-1 pb-16 lg:pb-0">{children}</main>
    </div>
  );
}
