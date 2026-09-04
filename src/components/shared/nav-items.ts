import { UserRole } from "@/types/enums";

export interface NavItem {
  href: string;
  label: string;
}

/**
 * The primary navigation links, in order, for a viewer in the given role.
 * `null` is a signed out visitor.
 *
 * One list, read by both the desktop nav and the mobile sheet, so the two
 * cannot drift into offering different things (#878).
 *
 * Find a Nurse is a family action. A signed in nurse being invited to browse
 * the directory of other nurses reads as the product not knowing who is signed
 * in, so that link is withheld from nurses only. An admin keeps it: reviewing
 * the directory is part of the job.
 */
export function primaryNavItems(role: UserRole | null): NavItem[] {
  const items: NavItem[] = [];

  if (role !== UserRole.NURSE) {
    items.push({ href: "/nurses", label: "Find a Nurse" });
  }

  items.push({ href: "/blog", label: "Blog" });

  return items;
}
