import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getAccounts, getRateLimitFlagged } from "@/lib/admin/queries";
import { AccountRowActions } from "@/components/admin/AccountRowActions";

export const metadata: Metadata = {
  title: "Accounts | NurseDex Admin",
  robots: { index: false, follow: false },
};

interface AccountsPageProps {
  searchParams: Promise<{ tab?: string; q?: string }>;
}

export default async function AdminAccountsPage({
  searchParams,
}: AccountsPageProps) {
  const params = await searchParams;
  const tab =
    params.tab === "nurses"
      ? "nurses"
      : params.tab === "families"
        ? "families"
        : params.tab === "flagged"
          ? "flagged"
          : "all";

  if (tab === "flagged") {
    const flagged = await getRateLimitFlagged();
    return (
      <div className="mx-auto w-full max-w-4xl p-6 sm:p-8">
        <Header />
        <Tabs active={tab} q={params.q ?? ""} />
        {flagged.length === 0 ? (
          <Empty msg="No families have hit 3+ consecutive captcha days." />
        ) : (
          <div className="space-y-3">
            {flagged.map((row) => (
              <Card key={row.family_user_id} className="border-sage/20">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
                  <div>
                    <p className="font-medium">
                      {row.first_name} {row.last_name}
                    </p>
                    <p className="text-muted-foreground text-xs">{row.email}</p>
                    <p className="text-muted-foreground text-xs">
                      Last flagged{" "}
                      {new Date(row.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-amber-200 bg-amber-50 text-amber-900"
                  >
                    {row.consecutive_captcha_days} consecutive captcha days
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  const role =
    tab === "nurses" ? "nurse" : tab === "families" ? "family" : undefined;
  const accounts = await getAccounts({ query: params.q, role });

  return (
    <div className="mx-auto w-full max-w-4xl p-6 sm:p-8">
      <Header />
      <Tabs active={tab} q={params.q ?? ""} />

      <form
        method="GET"
        className="mb-4 flex items-center gap-2"
        action="/admin/accounts"
      >
        <input type="hidden" name="tab" value={tab} />
        <Input
          type="search"
          name="q"
          placeholder="Search name or email..."
          defaultValue={params.q ?? ""}
          className="max-w-sm"
        />
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
        {params.q && (
          <Link
            href={`/admin/accounts${tab === "all" ? "" : `?tab=${tab}`}`}
            className="text-muted-foreground text-xs hover:underline"
          >
            Clear
          </Link>
        )}
      </form>

      {accounts.length === 0 ? (
        <Empty msg="No matching accounts." />
      ) : (
        <div className="space-y-3">
          {accounts.map((u) => (
            <Card key={u.user_id} className="border-sage/20">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {u.first_name || "(no name)"} {u.last_name ?? ""}
                  </p>
                  <p className="text-muted-foreground text-xs">{u.email}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {u.role && (
                      <Badge variant="outline" className="text-[10px]">
                        {u.role}
                      </Badge>
                    )}
                    {u.is_suspended && (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-[10px] text-amber-900"
                      >
                        Suspended
                      </Badge>
                    )}
                    {u.is_deleted && (
                      <Badge
                        variant="outline"
                        className="border-red-200 bg-red-50 text-[10px] text-red-900"
                      >
                        Removed
                      </Badge>
                    )}
                  </div>
                </div>
                <AccountRowActions
                  userId={u.user_id}
                  email={u.email}
                  isSuspended={u.is_suspended}
                  isDeleted={u.is_deleted}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <header className="mb-4">
      <h1 className="font-heading text-soft-black text-2xl font-semibold">
        Accounts
      </h1>
      <p className="text-soft-black-light mt-1 text-sm">
        Search, suspend, or remove user accounts.
      </p>
    </header>
  );
}

function Tabs({ active, q }: { active: string; q: string }) {
  const tabs: Array<{ key: string; label: string; href: string }> = [
    { key: "all", label: "All", href: "/admin/accounts" },
    { key: "nurses", label: "Nurses", href: "/admin/accounts?tab=nurses" },
    {
      key: "families",
      label: "Families",
      href: "/admin/accounts?tab=families",
    },
    {
      key: "flagged",
      label: "Rate limit flagged",
      href: "/admin/accounts?tab=flagged",
    },
  ];
  return (
    <nav className="border-sage/20 mb-6 flex flex-wrap items-center gap-1 border-b text-sm">
      {tabs.map((t) => {
        const href =
          q && t.key !== "flagged"
            ? `${t.href}${t.href.includes("?") ? "&" : "?"}q=${encodeURIComponent(q)}`
            : t.href;
        return (
          <Link
            key={t.key}
            href={href}
            className={`-mb-px border-b-2 px-3 py-2 transition-colors ${
              active === t.key
                ? "border-teal text-teal-dark font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <Card className="border-sage/20">
      <CardContent className="text-muted-foreground py-10 text-center text-sm">
        {msg}
      </CardContent>
    </Card>
  );
}
