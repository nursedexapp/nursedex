import { Text, Section, Hr, Link } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface NewsletterIssueProps {
  subject: string;
  body: string;
  unsubscribeUrl: string;
}

export function NewsletterIssue({
  subject,
  body,
  unsubscribeUrl,
}: NewsletterIssueProps) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <EmailLayout preview={subject}>
      <Section>
        <Text style={heading}>{subject}</Text>
        {paragraphs.map((p, i) => (
          <Text key={i} style={paragraph}>
            {p}
          </Text>
        ))}
        <Hr style={hr} />
        <Text style={footer}>
          You are receiving this because you subscribed to the NurseDex blog.{" "}
          <Link href={unsubscribeUrl} style={footerLink}>
            Unsubscribe
          </Link>
          .
        </Text>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "22px",
  fontWeight: 700,
  color: "#2D3436",
  margin: "0 0 16px",
  fontFamily: "Georgia, 'Times New Roman', serif",
};
const paragraph = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#2D3436",
  margin: "0 0 14px",
  whiteSpace: "pre-line" as const,
};
const hr = { borderColor: "#E8E4D8", margin: "24px 0 12px" };
const footer = {
  fontSize: "12px",
  lineHeight: "18px",
  color: "#636E72",
  margin: "0",
};
const footerLink = { color: "#2A7B6F", textDecoration: "underline" };
