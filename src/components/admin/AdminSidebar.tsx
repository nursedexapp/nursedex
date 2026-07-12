"use client";

import { useState } from "react";
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
  FileText,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NavPendingIcon } from "@/components/nav/NavPendingIcon";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SignOutButton } from "@/components/auth/SignOutButton";

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
  { href: "/admin/blog", label: "Blog", icon: FileText },
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
    pendingComments: number;
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
    case "/admin/blog":
      return c.pendingComments;
    default:
      return 0;
  }
}

export function AdminSidebar({ isSuperAdmin, counts }: AdminSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.superAdminOnly || isSuperAdmin);

  // Shared nav links for both the desktop sidebar and the mobile drawer.
  // onNavigate closes the drawer after a tap on mobile.
  const navLinks = (onNavigate?: () => void) =>
    items.map((item) => {
      const active =
        pathname === item.href ||
        (item.href !== "/admin" && pathname.startsWith(item.href));
      const badge = badgeFor(item.href, counts);
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
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
    });

  const signOutButton = (onNavigate?: () => void) => (
    <SignOutButton onNavigate={onNavigate} />
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="border-sage/20 bg-warm-white hidden w-56 shrink-0 border-r p-4 md:block">
        <p className="text-muted-foreground mb-4 px-2 text-[11px] font-semibold tracking-wider uppercase">
          NurseDex Admin
        </p>
        <nav className="space-y-1">{navLinks()}</nav>
        <div className="border-sage/20 mt-6 border-t pt-4">
          {signOutButton()}
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="border-sage/20 bg-warm-white fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b px-4 md:hidden">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
          NurseDex Admin
        </span>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            className="text-soft-black hover:bg-sage/10 cursor-pointer rounded-md p-2 transition-colors"
            aria-label="Open admin menu"
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="bg-warm-white w-72">
            <SheetTitle className="text-muted-foreground px-4 pt-1 text-[11px] font-semibold tracking-wider uppercase">
              NurseDex Admin
            </SheetTitle>
            <nav className="space-y-1 px-4">
              {navLinks(() => setOpen(false))}
            </nav>
            <div className="border-sage/20 mx-4 mt-2 border-t pt-3">
              {signOutButton(() => setOpen(false))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
