import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface VerifyReviewProps {
  reviewerName: string;
  verifyUrl: string;
}

export function VerifyReview({ reviewerName, verifyUrl }: VerifyReviewProps) {
  return (
    <EmailLayout preview="Confirm your NurseDex review">
      <Section>
        <Text style={heading}>Confirm your review</Text>
        <Text style={paragraph}>Hi {reviewerName},</Text>
        <Text style={paragraph}>
          Thanks for sharing your experience on NurseDex. Click the button below
          to confirm your email so a moderator can review and publish your post.
        </Text>
        <Link href={verifyUrl} style={button}>
          Confirm my review
        </Link>
        <Text style={paragraph}>
          This link expires in 7 days. If you didn&apos;t submit a review on
          NurseDex, you can safely ignore this email.
        </Text>
        <Text style={footer}>
          Questions? Reach us at{" "}
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
