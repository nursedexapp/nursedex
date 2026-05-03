import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface CancellationConfirmationProps {
  firstName?: string;
  planLabel: string;
  accessUntilLabel: string;
  isFamily: boolean;
}

export function CancellationConfirmation({
  firstName,
  planLabel,
  accessUntilLabel,
  isFamily,
}: CancellationConfirmationProps) {
  return (
    <EmailLayout preview={`Your ${planLabel} subscription is set to cancel.`}>
      <Section>
        <Text style={heading}>
          Cancellation confirmed{firstName ? `, ${firstName}` : ""}
        </Text>
        <Text style={paragraph}>
          We&apos;ve scheduled your {planLabel} subscription to cancel.
          You&apos;ll keep access until <strong>{accessUntilLabel}</strong>,
          when the current billing period ends.
        </Text>
        {isFamily && (
          <Text style={paragraph}>
            After that, you&apos;ll keep access to nurses you already
            revealed for 60 more days, so you don&apos;t lose contact info
            for anyone you&apos;re already in touch with. New reveals will
            require resubscribing.
          </Text>
        )}
        <Text style={paragraph}>
          Changed your mind? You can reactivate before the period ends from
          the Stripe billing portal.
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
