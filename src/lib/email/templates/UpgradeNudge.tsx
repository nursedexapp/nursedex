import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface UpgradeNudgeProps {
  firstName?: string;
  saveCount: number;
}

export function UpgradeNudge({ firstName, saveCount }: UpgradeNudgeProps) {
  const lead =
    saveCount === 1
      ? "1 family saved your profile."
      : `${saveCount} families saved your profile.`;

  return (
    <EmailLayout preview={lead}>
      <Section>
        <Text style={heading}>
          Families are noticing you{firstName ? `, ${firstName}` : ""}
        </Text>
        <Text style={paragraph}>{lead} Featured nurses get:</Text>
        <Text style={paragraph}>
          - Top placement in search results
          <br />
          - A Featured badge on every profile view
          <br />
          - Priority verification (24 hour SLA versus 72)
          <br />- A longer bio and up to three photos
        </Text>
        <Link href="https://nursedex.com/dashboard" style={button}>
          Upgrade to Featured
        </Link>
        <Text style={footer}>
          You&apos;re getting this because at least one family saved you and
          you&apos;re still on the free plan. We send these no more than once
          every 14 days. Reply or reach{" "}
          <Link href="mailto:support@nursedex.com" style={link}>
            support@nursedex.com
          </Link>{" "}
          if you&apos;d rather not get them.
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
