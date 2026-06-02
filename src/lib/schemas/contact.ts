import { z } from "zod";

export const CONTACT_NAME_MAX = 80;
export const CONTACT_SUBJECT_MAX = 120;
export const CONTACT_MESSAGE_MIN = 10;
export const CONTACT_MESSAGE_MAX = 2000;

export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(CONTACT_NAME_MAX, `Keep name under ${CONTACT_NAME_MAX} characters`),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required")
    .max(
      CONTACT_SUBJECT_MAX,
      `Keep subject under ${CONTACT_SUBJECT_MAX} characters`,
    ),
  message: z
    .string()
    .trim()
    .min(
      CONTACT_MESSAGE_MIN,
      `Message must be at least ${CONTACT_MESSAGE_MIN} characters`,
    )
    .max(
      CONTACT_MESSAGE_MAX,
      `Keep your message under ${CONTACT_MESSAGE_MAX} characters`,
    ),
  turnstile_token: z.string().min(1, "Please complete the CAPTCHA"),
});

export type ContactInput = z.infer<typeof contactSchema>;
