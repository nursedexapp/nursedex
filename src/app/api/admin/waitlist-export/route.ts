import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");

  if (!key || key !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

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
