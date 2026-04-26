"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  UserPen,
  Eye,
  Settings,
  LogOut,
  Heart,
  Search,
} from "lucide-react";
import { signOut } from "@/lib/auth/actions";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NURSE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/edit", label: "Edit Profile", icon: UserPen },
  { href: "/dashboard/preview", label: "Preview", icon: Eye },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const FAMILY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/nurses", label: "Find a Nurse", icon: Search },
  { href: "/dashboard/saved", label: "Saved Nurses", icon: Heart },
  { href: "/dashboard/revealed", label: "Revealed", icon: Eye },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

interface DashboardSidebarProps {
  role: string | null;
}

export function DashboardSidebar({ role }: DashboardSidebarProps) {
  const pathname = usePathname();
  const navItems = role === "family" ? FAMILY_NAV : NURSE_NAV;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="border-sage/20 hidden w-56 shrink-0 border-r bg-white lg:block">
        <div className="flex h-full flex-col">
          <div className="border-sage/20 border-b px-4 py-4">
            <Link
              href="/"
              className="font-heading text-teal text-lg font-semibold"
            >
              NurseDex
            </Link>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-3">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive =
                href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-teal/10 text-teal font-medium"
                      : "text-muted-foreground hover:bg-sage/10 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="border-sage/20 border-t px-2 py-3">
            <form action={signOut}>
              <button
                type="submit"
                className="text-muted-foreground hover:bg-sage/10 hover:text-foreground flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="border-sage/20 fixed inset-x-0 bottom-0 z-50 flex border-t bg-white lg:hidden">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors",
                isActive ? "text-teal" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
