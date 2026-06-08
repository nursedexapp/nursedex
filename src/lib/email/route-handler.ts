import { NextRequest, NextResponse } from "next/server";
import type { ReactElement } from "react";
import type { z } from "zod/v4";

export interface EmailMessage {
  from: string;
  to: string | string[];
  subject: string;
  react: ReactElement;
  replyTo?: string;
}

/**
 * Shared handler for the transactional email route handlers. Owns the parts
 * every one repeats: CRON_SECRET auth, Zod body parsing, the Resend client,
 * the send, and error handling. Each route just supplies its schema and a
 * `build` that dynamically imports its template (kept dynamic to avoid the
 * Turbopack ESM issues with resend/@react-email) and returns the message.
 */
export async function handleEmailRoute<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
  build: (data: T) => Promise<EmailMessage>,
  label: string,
): Promise<NextResponse> {
  if (
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send(await build(parsed.data));
    if (error) {
      console.error(`[email] ${label} send failed:`, error);
      return NextResponse.json({ error: "Send failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[email] ${label} error:`, err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
