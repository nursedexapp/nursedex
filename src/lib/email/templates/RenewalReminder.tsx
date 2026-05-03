import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface RenewalReminderProps {
  firstName?: string;
  planLabel: string;
  amount: string;
  renewalDateLabel: string;
}

export function RenewalReminder({
  firstName,
  planLabel,
  amount,
  renewalDateLabel,
}: RenewalReminderProps) {
  return (
    <EmailLayout preview={`Heads up: your ${planLabel} renews in 3 days.`}>
      <Section>
        <Text style={heading}>
          Your {planLabel} renews soon{firstName ? `, ${firstName}` : ""}
        </Text>
        <Text style={paragraph}>
          We&apos;ll charge {amount} on <strong>{renewalDateLabel}</strong>.
          No action needed if you want to keep your subscription. Want to
          cancel before then? You can manage everything in the Stripe
          billing portal from your dashboard.
        </Text>
        <Link href="https://nursedex.com/dashboard" style={button}>
          Go to dashboard
        </Link>
        <Text style={footer}>
          Questions? Reply or reach{" "}
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
