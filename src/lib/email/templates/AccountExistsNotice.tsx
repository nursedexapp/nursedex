import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface AccountExistsNoticeProps {
  firstName?: string;
}

export function AccountExistsNotice({ firstName }: AccountExistsNoticeProps) {
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";

  return (
    <EmailLayout preview="You already have a NurseDex account.">
      <Section>
        <Text style={heading}>You already have a NurseDex account</Text>
        <Text style={paragraph}>{greeting}</Text>
        <Text style={paragraph}>
          Someone just tried to create a NurseDex account with this email
          address, but you already have one. No new account was created and
          nothing about your account changed.
        </Text>
        <Text style={paragraph}>
          If this was you, log in below. If you forgot your password, use the
          reset link and you will be back in a moment.
        </Text>
        <Link href="https://nursedex.com/login" style={button}>
          Log in
        </Link>
        <Text style={paragraph}>
          <Link href="https://nursedex.com/forgot-password" style={link}>
            Reset your password
          </Link>
        </Text>
        <Text style={footer}>
          If you did not try to sign in, you can safely ignore this email. Your
          account is secure. Questions? Reach us at{" "}
          <Link href="mailto:support@nursedex.com" style={link}>
            support@nursedex.com
          </Link>
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

const link = {
  color: "#2A7B6F",
  textDecoration: "underline",
};

const footer = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#636E72",
  margin: "24px 0 0",
};
