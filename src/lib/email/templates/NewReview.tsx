import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface NewReviewProps {
  firstName?: string;
  rating: number;
  reviewerName: string;
}

export function NewReview({
  firstName,
  rating,
  reviewerName,
}: NewReviewProps) {
  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);

  return (
    <EmailLayout preview="A family left you a new review on NurseDex.">
      <Section>
        <Text style={heading}>
          New review{firstName ? `, ${firstName}` : ""}!
        </Text>
        <Text style={paragraph}>
          {reviewerName} just left you a {rating} star review on NurseDex.
        </Text>
        <Text style={stars_}>{stars}</Text>
        <Text style={paragraph}>
          Reviews go through a quick moderation step before they appear on
          your public profile. We will email you again when this one is
          live, and you can respond to it from your dashboard at any time.
        </Text>
        <Link href="https://nursedex.com/dashboard" style={button}>
          Go to your dashboard
        </Link>
        <Text style={footer}>
          Questions? Reply to this email or reach out at{" "}
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
  fontSize: "22px",
  letterSpacing: "4px",
  color: "#D4A52E",
  margin: "8px 0 16px",
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
