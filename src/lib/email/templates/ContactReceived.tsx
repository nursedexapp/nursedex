import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface ContactReceivedProps {
  name: string;
  email: string;
  message: string;
}

export function ContactReceived({
  name,
  email,
  message,
}: ContactReceivedProps) {
  return (
    <EmailLayout preview={`Contact form: ${name}`}>
      <Section>
        <Text style={heading}>New contact submission</Text>
        <Text style={paragraph}>
          <strong>{name}</strong> just sent a message via the NurseDex
          contact form.
        </Text>
        <Text style={kv}>
          <strong>Reply to:</strong>{" "}
          <Link href={`mailto:${email}`} style={link}>
            {email}
          </Link>
        </Text>
        <Text style={messageBox}>{message}</Text>
        <Text style={footer}>
          This was filed in the contact_submissions table; admins can mark
          it read or add notes from the admin panel.
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
  margin: "0 0 12px",
};
const kv = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#2D3436",
  margin: "0 0 8px",
};
const messageBox = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#2D3436",
  backgroundColor: "#F7F5EF",
  padding: "12px 16px",
  borderRadius: "8px",
  whiteSpace: "pre-line" as const,
  margin: "0 0 16px",
};
const link = { color: "#2A7B6F", textDecoration: "underline" };
const footer = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#636E72",
  margin: "16px 0 0",
};
