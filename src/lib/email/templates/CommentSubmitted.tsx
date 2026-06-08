import { Text, Section, Button } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface CommentSubmittedProps {
  postTitle: string;
  authorName: string;
  body: string;
  moderateUrl: string;
}

export function CommentSubmitted({
  postTitle,
  authorName,
  body,
  moderateUrl,
}: CommentSubmittedProps) {
  return (
    <EmailLayout preview="A new blog comment is awaiting review">
      <Section>
        <Text style={heading}>New comment awaiting review</Text>
        <Text style={kv}>
          <strong>{authorName}</strong> commented on{" "}
          <strong>{postTitle}</strong>.
        </Text>
        <Text style={messageBox}>{body}</Text>
        <Button href={moderateUrl} style={button}>
          Review in admin
        </Button>
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
const kv = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#2D3436",
  margin: "0 0 12px",
};
const messageBox = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#2D3436",
  backgroundColor: "#F7F5EF",
  padding: "12px 16px",
  borderRadius: "8px",
  whiteSpace: "pre-line" as const,
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
