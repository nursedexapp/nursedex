import { z } from "zod";

export const NEWSLETTER_SOURCE_MAX = 40;

export const newsletterSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  source: z.string().trim().max(NEWSLETTER_SOURCE_MAX).optional(),
  // Honeypot: bots fill this, humans leave it empty. Accepted by the schema
  // and handled in the action (a filled value is silently dropped).
  website: z.string().optional(),
});

export type NewsletterInput = z.infer<typeof newsletterSchema>;

export const NEWSLETTER_SUBJECT_MAX = 150;
export const NEWSLETTER_BODY_MAX = 20000;

export const newsletterIssueSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(NEWSLETTER_SUBJECT_MAX),
  body: z.string().trim().min(1, "Body is required").max(NEWSLETTER_BODY_MAX),
});

export type NewsletterIssueInput = z.infer<typeof newsletterIssueSchema>;
