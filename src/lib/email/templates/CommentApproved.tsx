import { Text, Section, Button } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

interface CommentApprovedProps {
  postTitle: string;
  postUrl: string;
}

export function CommentApproved({ postTitle, postUrl }: CommentApprovedProps) {
  return (
    <EmailLayout preview="Your NurseDex comment is now live">
      <Section>
        <Text style={heading}>Your comment is live</Text>
        <Text style={paragraph}>
          Thanks for joining the conversation. Your comment on{" "}
          <strong>{postTitle}</strong> has been approved and is now visible on
          the post.
        </Text>
        <Button href={postUrl} style={button}>
          View the post
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
