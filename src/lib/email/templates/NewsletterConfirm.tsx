import { Text, Section, Button } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface NewsletterConfirmProps {
  confirmUrl: string;
}

export function NewsletterConfirm({ confirmUrl }: NewsletterConfirmProps) {
  return (
    <EmailLayout preview="Confirm your NurseDex newsletter subscription">
      <Section>
        <Text style={heading}>Confirm your subscription</Text>
        <Text style={paragraph}>
          Tap the button below to start getting NurseDex blog posts in your
          inbox. If you did not request this, you can safely ignore this email.
        </Text>
        <Button href={confirmUrl} style={button}>
          Confirm subscription
        </Button>
        <Text style={footer}>
          Or paste this link into your browser: {confirmUrl}
        </Text>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#2D3436",
  margin: "0 0 12px",
  fontFamily: "Georgia, 'Times New Roman', serif",
};
const paragraph = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#2D3436",
  margin: "0 0 20px",
};
const button = {
  backgroundColor: "#2A7B6F",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  padding: "12px 24px",
  borderRadius: "8px",
  display: "inline-block",
};
const footer = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#636E72",
  margin: "24px 0 0",
  wordBreak: "break-all" as const,
};
