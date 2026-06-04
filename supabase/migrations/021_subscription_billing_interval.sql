-- Track the billing cadence per subscription so monthly ($9.99) and annual
-- ($99/yr) Family Access plans can be distinguished for renewal reminders and
-- MRR. Featured nurse plans are always monthly. Existing subscriptions are all
-- monthly, so the default backfills them correctly.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'month'
  CHECK (billing_interval IN ('month', 'year'));
