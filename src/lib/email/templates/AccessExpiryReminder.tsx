import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface AccessExpiryReminderProps {
  firstName?: string;
  daysUntilExpiry: number;
  expiryDateLabel: string;
}

export function AccessExpiryReminder({
  firstName,
  daysUntilExpiry,
  expiryDateLabel,
}: AccessExpiryReminderProps) {
  const lead =
    daysUntilExpiry === 1
      ? "Your access to revealed nurses ends tomorrow."
      : `Your access to revealed nurses ends in ${daysUntilExpiry} days.`;

  return (
    <EmailLayout preview={lead}>
      <Section>
        <Text style={heading}>
          {daysUntilExpiry === 1
            ? "Heads up: access ends tomorrow"
            : `Heads up: access ends in ${daysUntilExpiry} days`}
          {firstName ? `, ${firstName}` : ""}
        </Text>
        <Text style={paragraph}>
          {lead} Your subscription is cancelled, so on{" "}
          <strong>{expiryDateLabel}</strong> you&apos;ll lose the contact info
          for nurses you previously revealed.
        </Text>
        <Link href="https://nursedex.com/dashboard" style={button}>
          Resubscribe
        </Link>
        <Text style={paragraph}>
          Resubscribing keeps your existing reveals and lets you reveal new
          nurses. If you&apos;d rather just download the contact info you have
          today, you can export it from{" "}
          <Link href="https://nursedex.com/dashboard/revealed" style={link}>
            your revealed list
          </Link>
          .
        </Text>
        <Text style={footer}>
          Questions? Reply to this email or reach{" "}
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
const link = { color: "#2A7B6F", textDecoration: "underline" };
const footer = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#636E72",
  margin: "24px 0 0",
};
