-- Add a subject line to contact form submissions.
ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS subject text;
