"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldCheck,
  MessageSquare,
  Flag,
  Users,
  BarChart3,
  KeyRound,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/actions";
import { NavPendingIcon } from "@/components/nav/NavPendingIcon";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  superAdminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/verifications", label: "Verifications", icon: ShieldCheck },
  { href: "/admin/reviews", label: "Reviews", icon: MessageSquare },
  { href: "/admin/disputes", label: "Disputes", icon: Flag },
  { href: "/admin/accounts", label: "Accounts", icon: Users },
  {
    href: "/admin/analytics",
    label: "Analytics",
    icon: BarChart3,
    superAdminOnly: true,
  },
  {
    href: "/admin/admins",
    label: "Admins",
    icon: KeyRound,
    superAdminOnly: true,
  },
];

interface AdminSidebarProps {
  isSuperAdmin: boolean;
  counts: {
    pendingVerifications: number;
    pendingReviews: number;
    pendingDisputes: number;
    removalRequests: number;
  };
}

// How many items are waiting for action under each nav destination.
function badgeFor(href: string, c: AdminSidebarProps["counts"]): number {
  switch (href) {
    case "/admin/verifications":
      return c.pendingVerifications;
    case "/admin/reviews":
      return c.pendingReviews + c.removalRequests;
    case "/admin/disputes":
      return c.pendingDisputes;
    default:
      return 0;
  }
}

export function AdminSidebar({ isSuperAdmin, counts }: AdminSidebarProps) {
  const pathname = usePathname();
  const items = NAV.filter((n) => !n.superAdminOnly || isSuperAdmin);

  return (
    <aside className="border-sage/20 bg-warm-white hidden w-56 shrink-0 border-r p-4 md:block">
      <p className="text-muted-foreground mb-4 px-2 text-[11px] font-semibold tracking-wider uppercase">
        NurseDex Admin
      </p>
      <nav className="space-y-1">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(item.href));
          const badge = badgeFor(item.href, counts);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                active
                  ? "bg-teal/10 text-teal-dark font-medium"
                  : "text-soft-black-light hover:bg-muted hover:text-foreground",
              )}
            >
              <NavPendingIcon icon={item.icon} className="size-4" />
              {item.label}
              {badge > 0 && (
                <span
                  className="bg-teal ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold text-white tabular-nums"
                  aria-label={`${badge} waiting`}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <form action={signOut} className="border-sage/20 mt-6 border-t pt-4">
        <button
          type="submit"
          className="text-soft-black-light hover:text-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </button>
      </form>
    </aside>
  );
}
