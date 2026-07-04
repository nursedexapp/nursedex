import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { isSafeRedirectPath } from "@/lib/auth/safe-redirect";

interface SupabaseEmailHookPayload {
  user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

const ALLOWED_TYPES = new Set([
  "signup",
  "recovery",
  "magiclink",
  "email_change",
  "invite",
  "reauthentication",
]);

function verifySignature(
  rawBody: string,
  headers: Headers,
  rawSecret: string,
): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signature = headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 5 * 60) return false;

  // Supabase formats secrets as "v1,whsec_<base64>". Accept raw forms too.
  const cleaned = rawSecret.startsWith("v1,whsec_")
    ? rawSecret.slice("v1,whsec_".length)
    : rawSecret.startsWith("whsec_")
      ? rawSecret.slice("whsec_".length)
      : rawSecret;
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(cleaned, "base64");
  } catch {
    return false;
  }

  const signed = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", secretBytes)
    .update(signed)
    .digest("base64");

  const candidates = signature
    .split(" ")
    .filter((s) => s.startsWith("v1,"))
    .map((s) => s.slice(3));

  for (const candidate of candidates) {
    try {
      const candBuf = Buffer.from(candidate, "base64");
      const expBuf = Buffer.from(expected, "base64");
      if (
        candBuf.length === expBuf.length &&
        crypto.timingSafeEqual(candBuf, expBuf)
      ) {
        return true;
      }
    } catch {
      // ignore malformed candidate
    }
  }
  return false;
}

export function buildConfirmUrl(payload: SupabaseEmailHookPayload): string {
  const { email_data } = payload;
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://nursedex.com";
  const params = new URLSearchParams({
    token_hash: email_data.token_hash,
    type: email_data.email_action_type,
  });

  // Supabase echoes the calling code's emailRedirectTo as redirect_to. Auth
  // actions point that at our /auth/callback (sometimes with a downstream
  // ?next=). Pass through ONLY the inner ?next= so /auth/callback knows
  // where to send the user after verifyOtp succeeds. Forwarding the full
  // redirect_to as next would loop the user back through /auth/callback.
  if (email_data.redirect_to) {
    try {
      const redirectUrl = new URL(email_data.redirect_to);
      const nextParam = redirectUrl.searchParams.get("next");
      if (isSafeRedirectPath(nextParam)) {
        params.set("next", nextParam);
      }
    } catch {
      // Malformed redirect_to. Leave next unset; /auth/callback defaults to
      // /role-select.
    }
  }

  return `${base}/auth/callback?${params.toString()}`;
}

export async function POST(request: NextRequest) {
  const secret = process.env.SUPABASE_AUTH_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[auth-email-hook] Missing SUPABASE_AUTH_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: SupabaseEmailHookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const actionType = payload.email_data?.email_action_type;
  if (!actionType || !ALLOWED_TYPES.has(actionType)) {
    return NextResponse.json(
      { error: `Unsupported action type: ${actionType ?? "<missing>"}` },
      { status: 400 },
    );
  }

  const recipient = payload.user?.email;
  if (!recipient) {
    return NextResponse.json(
      { error: "Missing recipient email" },
      { status: 400 },
    );
  }

  try {
    const { Resend } = await import("resend");
    const { AuthEmail, AUTH_EMAIL_SUBJECTS } = await import(
      "@/lib/email/templates/AuthEmail"
    );

    const resend = new Resend(process.env.RESEND_API_KEY);

    const confirmUrl = buildConfirmUrl(payload);
    const type = actionType as keyof typeof AUTH_EMAIL_SUBJECTS;

    const { error } = await resend.emails.send({
      from: "NurseDex Team <noreply@nursedex.com>",
      to: recipient,
      replyTo: "support@nursedex.com",
      subject: AUTH_EMAIL_SUBJECTS[type],
      react: AuthEmail({ type, confirmUrl, recipientEmail: recipient }),
    });

    if (error) {
      console.error("[auth-email-hook] Resend send failed:", error);
      return NextResponse.json({ error: "Send failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[auth-email-hook] Internal error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
