import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface DisputeDecisionProps {
  recipientType: "nurse" | "reviewer";
  recipientName?: string;
  decision: "keep" | "remove";
  rating: number;
  reviewerName: string;
  notes: string | null;
}

export function DisputeDecision({
  recipientType,
  recipientName,
  decision,
  rating,
  reviewerName,
  notes,
}: DisputeDecisionProps) {
  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";

  let summary: string;
  if (recipientType === "nurse") {
    summary =
      decision === "keep"
        ? `We reviewed the dispute on ${reviewerName}'s ${rating} star review and decided to keep it on your profile.`
        : `We reviewed the dispute on ${reviewerName}'s ${rating} star review and removed it from your profile.`;
  } else {
    summary =
      decision === "keep"
        ? `Thanks for your review. The nurse disputed it, but our team confirmed your review and it remains live on their profile.`
        : `Thanks for your review. After looking into a dispute on the post, our team has removed it from the nurse's profile.`;
  }

  return (
    <EmailLayout preview="Update on a NurseDex review dispute">
      <Section>
        <Text style={heading}>Dispute decision</Text>
        <Text style={paragraph}>{greeting}</Text>
        <Text style={paragraph}>{summary}</Text>
        <Text style={stars_}>{stars}</Text>
        {notes && (
          <>
            <Text style={paragraph}>
              <strong>Moderator notes:</strong>
            </Text>
            <Text style={notesBox}>{notes}</Text>
          </>
        )}
        <Text style={footer}>
          If you have questions about this decision, reply to this email or
          reach{" "}
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
const stars_ = {
  fontSize: "20px",
  letterSpacing: "4px",
  color: "#D4A52E",
  margin: "8px 0 16px",
};
const notesBox = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#2D3436",
  backgroundColor: "#F7F5EF",
  padding: "12px 16px",
  borderRadius: "8px",
  margin: "0 0 16px",
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
