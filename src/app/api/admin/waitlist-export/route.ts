import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/helpers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

function keyMatches(provided: string | null): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const providedKey = request.nextUrl.searchParams.get("key");
  const authorizedByKey = keyMatches(providedKey);

  if (!authorizedByKey) {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "admin" && user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
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
