import { requireAuth } from "@/lib/auth/helpers";

// role-select has no meaning for a signed-out visitor (it just picks the
// role for the currently authenticated account), but the page component
// itself is client-only and never checked for a session. Guard it here so
// an anonymous visitor is bounced to /login like every other protected page.
export default async function RoleSelectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  return children;
}
