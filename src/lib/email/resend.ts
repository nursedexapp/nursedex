import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export const EMAIL_FROM = "NurseDex Team <noreply@nursedex.com>";
export const EMAIL_REPLY_TO = "support@nursedex.com";
