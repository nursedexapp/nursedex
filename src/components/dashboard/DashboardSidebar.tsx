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
} from "lucide-react";
import { signOut } from "@/lib/auth/actions";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/edit", label: "Edit Profile", icon: UserPen },
  { href: "/dashboard/preview", label: "Preview", icon: Eye },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-sage/20 bg-white lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-sage/20 px-4 py-4">
            <Link
              href="/"
              className="font-heading text-lg font-semibold text-teal"
            >
              NurseDex
            </Link>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-3">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
                      ? "bg-teal/10 font-medium text-teal"
                      : "text-muted-foreground hover:bg-sage/10 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-sage/20 px-2 py-3">
            <form action={signOut}>
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sage/10 hover:text-foreground"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-sage/20 bg-white lg:hidden">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
                isActive
                  ? "text-teal"
                  : "text-muted-foreground",
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
