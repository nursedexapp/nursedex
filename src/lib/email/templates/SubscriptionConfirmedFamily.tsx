import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface SubscriptionConfirmedFamilyProps {
  firstName?: string;
  amount: string;
  nextRenewalLabel: string;
}

export function SubscriptionConfirmedFamily({
  firstName,
  amount,
  nextRenewalLabel,
}: SubscriptionConfirmedFamilyProps) {
  return (
    <EmailLayout preview="Family Access is active. You can now reveal nurse contact info.">
      <Section>
        <Text style={heading}>
          Family Access is active{firstName ? `, ${firstName}` : ""}
        </Text>
        <Text style={paragraph}>
          You&apos;re subscribed at <strong>{amount} per month</strong>, and the
          subscription <strong>renews automatically</strong> on{" "}
          {nextRenewalLabel}. You can cancel anytime through the Stripe billing
          portal, accessible from your dashboard.
        </Text>
        <Text style={paragraph}>
          You can now reveal contact info for any verified nurse on NurseDex. If
          you cancel later, you&apos;ll keep access to nurses you already
          revealed for 60 days.
        </Text>
        <Link href="https://nursedex.com/nurses" style={button}>
          Find a nurse
        </Link>
        <Text style={footer}>
          Refunds: NurseDex doesn&apos;t issue refunds, but you can cancel at
          any time and access ends at the end of the billing period. Questions?
          Reply or reach{" "}
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
