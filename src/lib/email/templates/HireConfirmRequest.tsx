import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface HireConfirmRequestProps {
  firstName?: string;
  nurseFirstName: string;
  claimToken: string;
}

export function HireConfirmRequest({
  firstName,
  nurseFirstName,
  claimToken,
}: HireConfirmRequestProps) {
  const confirmUrl = `https://nursedex.com/hires/confirm/${claimToken}`;
  return (
    <EmailLayout preview={`Did you hire ${nurseFirstName}?`}>
      <Section>
        <Text style={heading}>
          Did you hire {nurseFirstName}
          {firstName ? `, ${firstName}` : ""}?
        </Text>
        <Text style={paragraph}>
          {`${nurseFirstName} let us know they were hired by you on NurseDex. We'd love to confirm before showing it on their profile.`}
        </Text>
        <Link href={confirmUrl} style={button}>
          Confirm or reject
        </Link>
        <Text style={paragraph}>
          You can also leave a review on the same page if you haven&apos;t
          already.
        </Text>
        <Text style={footer}>
          If this isn&apos;t right or you don&apos;t recognize the request,
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
