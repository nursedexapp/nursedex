import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface SubscriptionConfirmedNurseProps {
  firstName?: string;
  amount: string;
  nextRenewalLabel: string;
}

export function SubscriptionConfirmedNurse({
  firstName,
  amount,
  nextRenewalLabel,
}: SubscriptionConfirmedNurseProps) {
  return (
    <EmailLayout preview="Welcome to NurseDex Featured.">
      <Section>
        <Text style={heading}>
          You&apos;re Featured{firstName ? `, ${firstName}` : ""}!
        </Text>
        <Text style={paragraph}>
          Thanks for upgrading. Your subscription is active at {amount} per
          month and will renew automatically on {nextRenewalLabel}.
        </Text>
        <Text style={paragraph}>
          As a Featured nurse you get priority placement in search, your
          profile gets a Featured badge, you can post a longer bio and up
          to three photos, and you get priority on license verification
          (24 hour SLA).
        </Text>
        <Link href="https://nursedex.com/dashboard" style={button}>
          Go to dashboard
        </Link>
        <Text style={footer}>
          Manage or cancel anytime through the Stripe billing portal,
          accessible from your dashboard. Questions? Reply or reach{" "}
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
