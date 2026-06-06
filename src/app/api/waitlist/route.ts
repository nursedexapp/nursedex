import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

const DISPLAY_THRESHOLD = 25;

const waitlistSchema = z.object({
  email: z.email(),
  role: z.enum(["nurse", "family"]),
  honeypot: z.string().optional(),
  referral_source: z.string().optional(),
});

async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + (process.env.RATE_LIMIT_SALT ?? "nursedex"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = waitlistSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    const { email, role, honeypot, referral_source } = parsed.data;

    // Bot protection: reject if honeypot field has a value
    if (honeypot) {
      // Return success to not reveal the trap
      return NextResponse.json({
        success: true,
        message: "You're on the list!",
      });
    }

    // Rate limiting by IP
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
    const ipHash = await hashIP(ip);

    const supabase = await createClient();

    // The waitlist SELECT policy is service_role-only, so the rate-limit count
    // must use a service-role client. Under the anon client it always returns 0
    // and the limit never triggers.
    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("waitlist")
      .select("*", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", oneHourAgo);

    if (count !== null && count >= 5) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Too many signups from this network. Please try again later.",
        },
        { status: 429 },
      );
    }

    // Insert into waitlist
    const { error } = await supabase.from("waitlist").insert({
      email: email.toLowerCase().trim(),
      role,
      referral_source: referral_source || null,
      ip_hash: ipHash,
    });

    if (error) {
      // Unique constraint violation = already signed up
      if (error.code === "23505") {
        return NextResponse.json({
          success: true,
          alreadySignedUp: true,
          message: "You're already on the list! We'll be in touch soon.",
        });
      }
      console.error("Waitlist insert error:", error);
      return NextResponse.json(
        { success: false, message: "Something went wrong. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "You're on the list! We'll let you know when NurseDex launches.",
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );

    const { count } = await admin
      .from("waitlist")
      .select("*", { count: "exact", head: true });

    if (count === null || count < DISPLAY_THRESHOLD) {
      return NextResponse.json(
        { show: false },
        {
          headers: { "Cache-Control": "public, s-maxage=300" },
        },
      );
    }

    // Round down to nearest 10
    const rounded = Math.floor(count / 10) * 10;

    return NextResponse.json(
      { show: true, count: rounded },
      {
        headers: { "Cache-Control": "public, s-maxage=300" },
      },
    );
  } catch {
    return NextResponse.json({ show: false });
  }
}
