// Pure helpers for the admin Accounts page tabs. Kept out of the page
// component so the tab -> query mapping is unit-testable.

export type AccountsTab = "all" | "nurses" | "families" | "removed" | "flagged";

export const ACCOUNT_TABS: Array<{
  key: AccountsTab;
  label: string;
  href: string;
}> = [
  { key: "all", label: "All", href: "/admin/accounts" },
  { key: "nurses", label: "Nurses", href: "/admin/accounts?tab=nurses" },
  { key: "families", label: "Families", href: "/admin/accounts?tab=families" },
  { key: "removed", label: "Removed", href: "/admin/accounts?tab=removed" },
  {
    key: "flagged",
    label: "Rate limit flagged",
    href: "/admin/accounts?tab=flagged",
  },
];

/** Normalize the raw `?tab=` value to a known tab, defaulting to "all". */
export function resolveAccountsTab(raw: string | undefined): AccountsTab {
  switch (raw) {
    case "nurses":
    case "families":
    case "removed":
    case "flagged":
      return raw;
    default:
      return "all";
  }
}

/**
 * The getAccounts arguments a tab implies. "removed" lists soft-deleted
 * accounts across all roles; the role tabs list live accounts of that role.
 * Not meaningful for "flagged", which uses a different query.
 */
export function accountsQueryForTab(tab: AccountsTab): {
  role?: "nurse" | "family";
  deleted: boolean;
} {
  switch (tab) {
    case "nurses":
      return { role: "nurse", deleted: false };
    case "families":
      return { role: "family", deleted: false };
    case "removed":
      return { deleted: true };
    default:
      return { deleted: false };
  }
}
