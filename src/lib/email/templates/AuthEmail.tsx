import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

export type AuthEmailType =
  | "signup"
  | "recovery"
  | "magiclink"
  | "email_change"
  | "invite"
  | "reauthentication";

interface AuthEmailProps {
  type: AuthEmailType;
  confirmUrl: string;
  recipientEmail: string;
}

interface CopyVariant {
  preview: string;
  heading: string;
  body: string;
  cta: string;
  footer: string;
}

const COPY: Record<AuthEmailType, CopyVariant> = {
  signup: {
    preview: "Confirm your email to start using NurseDex.",
    heading: "Confirm your email",
    body: "Welcome to NurseDex. Click the button below to confirm your email and finish setting up your account.",
    cta: "Confirm email",
    footer:
      "If you didn't create a NurseDex account, you can safely ignore this email.",
  },
  recovery: {
    preview: "Reset your NurseDex password.",
    heading: "Reset your password",
    body: "We received a request to reset your NurseDex password. Click the button below to choose a new one.",
    cta: "Reset password",
    footer:
      "If you didn't request a password reset, you can safely ignore this email. Your password won't change.",
  },
  magiclink: {
    preview: "Your NurseDex sign in link.",
    heading: "Sign in to NurseDex",
    body: "Click the button below to sign in to your NurseDex account.",
    cta: "Sign in",
    footer:
      "If you didn't try to sign in, you can safely ignore this email.",
  },
  email_change: {
    preview: "Confirm your new NurseDex email.",
    heading: "Confirm your new email",
    body: "Click the button below to confirm the change to your NurseDex email address.",
    cta: "Confirm new email",
    footer:
      "If you didn't request this change, please contact support@nursedex.com.",
  },
  invite: {
    preview: "You've been invited to NurseDex.",
    heading: "You're invited to NurseDex",
    body: "You've been invited to join NurseDex. Click the button below to accept and set up your account.",
    cta: "Accept invite",
    footer:
      "If you weren't expecting this invite, you can safely ignore this email.",
  },
  reauthentication: {
    preview: "Confirm it's you on NurseDex.",
    heading: "Confirm it's you",
    body: "Click the button below to confirm your identity and continue.",
    cta: "Confirm",
    footer:
      "If you didn't request this, please contact support@nursedex.com.",
  },
};

export const AUTH_EMAIL_SUBJECTS: Record<AuthEmailType, string> = {
  signup: "Confirm your NurseDex email",
  recovery: "Reset your NurseDex password",
  magiclink: "Your NurseDex sign in link",
  email_change: "Confirm your new NurseDex email",
  invite: "You're invited to NurseDex",
  reauthentication: "Confirm it's you on NurseDex",
};

export function AuthEmail({
  type,
  confirmUrl,
  recipientEmail,
}: AuthEmailProps) {
  const copy = COPY[type];
  return (
    <EmailLayout preview={copy.preview}>
      <Section>
        <Text style={heading}>{copy.heading}</Text>
        <Text style={paragraph}>Hi,</Text>
        <Text style={paragraph}>{copy.body}</Text>
        <Link href={confirmUrl} style={button}>
          {copy.cta}
        </Link>
        <Text style={fineprint}>
          Or copy and paste this link into your browser:
        </Text>
        <Link href={confirmUrl} style={url}>
          {confirmUrl}
        </Link>
        <Text style={fineprintLast}>{copy.footer}</Text>
        <Text style={support}>
          Questions? Reach us at{" "}
          <Link href="mailto:support@nursedex.com" style={supportLink}>
            support@nursedex.com
          </Link>
          {recipientEmail ? ` (sent to ${recipientEmail})` : ""}
        </Text>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "24px",
  fontWeight: 700,
  color: "#2D3436",
  margin: "0 0 16px",
  fontFamily: "Georgia, 'Times New Roman', serif",
};

const paragraph = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#2D3436",
  margin: "0 0 12px",
};

const button = {
  display: "inline-block",
  backgroundColor: "#2A7B6F",
  color: "#FFFFFF",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  padding: "12px 24px",
  borderRadius: "8px",
  margin: "16px 0",
};

const fineprint = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#636E72",
  margin: "24px 0 4px",
};

const url = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#2A7B6F",
  wordBreak: "break-all" as const,
  margin: "0 0 16px",
};

const fineprintLast = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#636E72",
  margin: "16px 0",
};

const support = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#636E72",
  margin: "24px 0 0",
};

const supportLink = {
  color: "#2A7B6F",
  textDecoration: "underline",
};
