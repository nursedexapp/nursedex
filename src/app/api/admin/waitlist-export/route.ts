import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/helpers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Admin-only CSV export of the waitlist. Gated by authenticated session
 * with role admin or super_admin. The waitlist table itself is read via
 * the service-role client because RLS blocks anonymous reads.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin" && user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("waitlist")
    .select("email, role, referral_source, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Waitlist export error:", error);
    return NextResponse.json(
      { error: "Failed to fetch waitlist" },
      { status: 500 },
    );
  }

  if (!data || data.length === 0) {
    return new Response("No signups yet.", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const headers = ["email", "role", "referral_source", "signed_up"];
  const rows = data.map((row) => [
    row.email,
    row.role,
    row.referral_source ?? "",
    new Date(row.created_at).toLocaleDateString("en-US"),
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n");

  const today = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="nursedex-waitlist-${today}.csv"`,
    },
  });
}
