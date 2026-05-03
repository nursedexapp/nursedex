import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface PaymentFailureFinalProps {
  firstName?: string;
  planLabel: string;
  consequenceSummary: string;
  portalUrl: string;
}

export function PaymentFailureFinal({
  firstName,
  planLabel,
  consequenceSummary,
  portalUrl,
}: PaymentFailureFinalProps) {
  return (
    <EmailLayout preview="Your NurseDex subscription has been downgraded.">
      <Section>
        <Text style={heading}>
          Your {planLabel} access ended{firstName ? `, ${firstName}` : ""}
        </Text>
        <Text style={paragraph}>{consequenceSummary}</Text>
        <Text style={paragraph}>
          You can resubscribe at any time. Updating your payment method
          and retrying through Stripe will reactivate your access right
          away.
        </Text>
        <Link href={portalUrl} style={button}>
          Update payment method
        </Link>
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
