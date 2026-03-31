-- Waitlist for pre-launch email collection

create type waitlist_role as enum ('nurse', 'family');

create table waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  role       waitlist_role not null,
  referral_source text,
  ip_hash    text,
  created_at timestamptz not null default now(),

  constraint waitlist_email_unique unique (email)
);

alter table waitlist enable row level security;

create policy "Anyone can sign up"
  on waitlist for insert
  to anon, authenticated
  with check (true);

create policy "Only service role can read"
  on waitlist for select
  to service_role
  using (true);
