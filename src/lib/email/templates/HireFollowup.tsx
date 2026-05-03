import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface HireFollowupProps {
  firstName?: string;
}

export function HireFollowup({ firstName }: HireFollowupProps) {
  return (
    <EmailLayout preview="Did you end up hiring a nurse on NurseDex?">
      <Section>
        <Text style={heading}>
          Did you find a nurse{firstName ? `, ${firstName}` : ""}?
        </Text>
        <Text style={paragraph}>
          It&apos;s been about a month since you revealed contact info for a
          nurse on NurseDex. Did you end up hiring anyone?
        </Text>
        <Link
          href="https://nursedex.com/dashboard/revealed"
          style={button}
        >
          Mark a hire
        </Link>
        <Text style={paragraph}>
          Recording a hire helps the nurse&apos;s profile and other Long
          Island families see who&apos;s been trusted before. If you&apos;re
          still looking, you can also{" "}
          <Link href="https://nursedex.com/nurses" style={link}>
            browse more nurses
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
