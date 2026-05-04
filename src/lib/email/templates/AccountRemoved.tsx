import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface AccountRemovedProps {
  firstName?: string;
  reason: string;
}

export function AccountRemoved({ firstName, reason }: AccountRemovedProps) {
  return (
    <EmailLayout preview="Your NurseDex account has been removed.">
      <Section>
        <Text style={heading}>
          Your NurseDex account has been removed
          {firstName ? `, ${firstName}` : ""}
        </Text>
        <Text style={paragraph}>
          We&apos;ve closed your NurseDex account. Any active subscriptions have
          been cancelled. Reason given:
        </Text>
        <Text style={reasonBox}>{reason}</Text>
        <Text style={paragraph}>
          You can no longer log in, and this email address can&apos;t be used to
          sign up again. If you believe this was a mistake or want to appeal the
          decision, please reach out below within 30 days.
        </Text>
        <Text style={footer}>
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
const reasonBox = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#2D3436",
  backgroundColor: "#F7F5EF",
  padding: "12px 16px",
  borderRadius: "8px",
  margin: "0 0 16px",
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
