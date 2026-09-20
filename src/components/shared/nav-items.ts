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
 *
 * Pricing is offered to everybody, because the page serves both audiences and
 * chooses which one to show from who is signed in. It is here rather than only
 * in the footer because it is the only route a signed out visitor has to the
 * paid products: before #1042 it could be reached from three dashboard
 * surfaces and nowhere else, so nobody who had not already signed up could
 * find the page that sells Featured.
 */
export function primaryNavItems(role: UserRole | null): NavItem[] {
  const items: NavItem[] = [];

  if (role !== UserRole.NURSE) {
    items.push({ href: "/nurses", label: "Find a Nurse" });
  }

  items.push({ href: "/pricing", label: "Pricing" });
  items.push({ href: "/blog", label: "Blog" });

  return items;
}
