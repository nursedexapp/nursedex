import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAdminUsers } from "@/lib/admin/analytics";
import {
  PromoteForm,
  DemoteButton,
} from "@/components/admin/AdminRoleControls";

export const metadata: Metadata = {
  title: "Admins | NurseDex Admin",
  robots: { index: false, follow: false },
};

export default async function AdminsPage() {
  const me = await requireSuperAdmin();
  const admins = await getAdminUsers();

  return (
    <div className="mx-auto w-full max-w-3xl p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="font-heading text-soft-black text-2xl font-semibold">
          Admins
        </h1>
        <p className="text-soft-black-light mt-1 text-sm">
          Super admin only. Grant existing users admin access by email, or
          demote an admin back to a family role user.
        </p>
      </header>

      <section className="mb-6">
        <h2 className="text-soft-black mb-2 text-sm font-semibold">
          Grant admin role
        </h2>
        <PromoteForm />
        <p className="text-muted-foreground mt-2 text-xs">
          The user must have a NurseDex account already. If they don&apos;t,
          have them sign up first, then grant the role here.
        </p>
      </section>

      <section>
        <h2 className="text-soft-black mb-2 text-sm font-semibold">
          Current admins
        </h2>
        <div className="space-y-3">
          {admins.map((u) => (
            <Card key={u.user_id} className="border-sage/20">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
                <div>
                  <p className="font-medium">
                    {u.first_name || "(no name)"} {u.last_name ?? ""}
                  </p>
                  <p className="text-muted-foreground text-xs">{u.email}</p>
                  <Badge
                    variant="outline"
                    className={
                      u.role === "super_admin"
                        ? "border-teal/30 bg-teal/5 text-teal-dark mt-1 text-[10px]"
                        : "mt-1 text-[10px]"
                    }
                  >
                    {u.role.replace("_", " ")}
                  </Badge>
                </div>
                <DemoteButton
                  userId={u.user_id}
                  email={u.email}
                  isSelf={u.user_id === me.id}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
