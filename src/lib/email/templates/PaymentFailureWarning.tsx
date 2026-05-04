import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface PaymentFailureWarningProps {
  firstName?: string;
  dayNumber: 1 | 2;
  planLabel: string;
  consequenceLabel: string;
  portalUrl: string;
}

export function PaymentFailureWarning({
  firstName,
  dayNumber,
  planLabel,
  consequenceLabel,
  portalUrl,
}: PaymentFailureWarningProps) {
  return (
    <EmailLayout
      preview={`Day ${dayNumber} of 3: your NurseDex payment didn't go through.`}
    >
      <Section>
        <Text style={heading}>
          We couldn&apos;t charge your card{firstName ? `, ${firstName}` : ""}
        </Text>
        <Text style={paragraph}>
          Your most recent {planLabel} payment didn&apos;t go through. This is
          day {dayNumber} of a 3 day grace period. {consequenceLabel}
        </Text>
        <Link href={portalUrl} style={button}>
          Update payment method
        </Link>
        <Text style={paragraph}>
          The Stripe billing portal will let you swap cards, retry the payment,
          or cancel if you no longer want the subscription.
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
