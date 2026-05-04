import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface VerificationRejectedProps {
  firstName?: string;
  reason: string;
}

export function VerificationRejected({
  firstName,
  reason,
}: VerificationRejectedProps) {
  return (
    <EmailLayout preview="We couldn't verify your NurseDex license.">
      <Section>
        <Text style={heading}>
          We couldn&apos;t verify your license
          {firstName ? `, ${firstName}` : ""}
        </Text>
        <Text style={paragraph}>
          Our team checked your license against the NY State database and ran
          into the following issue:
        </Text>
        <Text style={reasonBox}>{reason}</Text>
        <Text style={paragraph}>
          You can update your profile and resubmit at any time. Your profile
          will go back into the verification queue. If your tier is Featured,
          your resubmission keeps priority placement.
        </Text>
        <Link href="https://nursedex.com/dashboard/edit" style={button}>
          Update your profile
        </Link>
        <Text style={footer}>
          If you think this was a mistake or need help interpreting the reason,
          reply to this email or reach{" "}
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
