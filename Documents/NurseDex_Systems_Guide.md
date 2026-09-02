# NurseDex Systems Guide

A plain-language overview of every service NurseDex uses, what it does, and how to access it. This document is for anyone managing the business who may not have a technical background.

Last updated: March 27, 2026

---

## Quick Reference

| Service | What It Does | Monthly Cost | Login URL |
|---------|-------------|-------------|-----------|
| Vercel | Hosts the website | Pro plan (included) | vercel.com |
| Supabase | Database and user accounts | Free (upgrade later) | supabase.com |
| Stripe | Processes payments | 2.9% + 30 cents per transaction | dashboard.stripe.com |
| Resend | Sends emails from the platform | Free tier | resend.com |
| Google Workspace | support@nursedex.com inbox | ~$13/month | gmail.com (sign in as support@nursedex.com) |
| PostHog | Tracks how people use the site | Free tier | us.posthog.com |
| Sentry | Alerts when something breaks | Free tier | sentry.io |
| Cloudflare Turnstile | Prevents bots and spam | Free | dash.cloudflare.com |
| Google Cloud | Powers "Sign in with Google" | Free | console.cloud.google.com |
| GitHub | Stores the code | Free (private repo) | github.com/nursedexapp |

---

## Vercel

**What it does:** Vercel is where the NurseDex website lives. When code changes are made, Vercel automatically builds and publishes the updated site. Think of it like the hosting company for nursedex.com.

**What you might need it for:**
- Checking if the site is online
- Viewing deployment history (every version of the site that was published)
- Managing environment variables (secret keys that connect all the services together)
- Managing the nursedex.com domain and DNS settings

**Login:** vercel.com, sign in with the nursedexapp account

**Important:** The domain nursedex.com is registered through Vercel. If you ever need to renew the domain or change DNS settings, this is where you do it.

---

## Supabase

**What it does:** Supabase is the database. It stores everything: user accounts, nurse profiles, family accounts, reviews, subscription records, saved nurses, and more. It also handles user authentication (signing up, logging in, password resets).

**What you might need it for:**
- Viewing data (nurse profiles, family accounts, reviews)
- Manually updating a user's role (like making someone an admin)
- Checking if the database is healthy
- Viewing authentication settings

**Login:** supabase.com, sign in with the nursedexapp account. Project name is "NurseDex," project ID is fisuhtkzhyttdmqoivlp.

**Important:** This is where all user data lives. Be very careful making changes here. Deleting data in Supabase is permanent on the free plan (no automatic backups). Upgrade to Pro plan ($25/month) before launch to enable automatic backups.

---

## Stripe

**What it does:** Stripe processes all payments. When a nurse subscribes to Featured ($29/month) or a family subscribes for access ($19.99/month), Stripe handles the credit card charges, billing, receipts, and subscription management.

**What you might need it for:**
- Viewing revenue and transaction history
- Issuing refunds
- Checking on failed payments
- Managing subscription plans (changing prices, creating new tiers)
- Viewing customer payment details
- Downloading tax and financial reports

**Login:** dashboard.stripe.com, sign in with the nursedexapp account. The account is under NurseDex LLC.

**Important:** Stripe is in live mode, meaning it processes real payments. There is also a "test mode" toggle in the dashboard for testing without real charges. The Customer Portal (where customers manage their own subscriptions) is already configured.

**Costs:** Stripe takes 2.9% + $0.30 per successful charge. There are no monthly fees from Stripe itself.

---

## Resend

**What it does:** Resend sends all transactional emails from NurseDex. This includes welcome emails, subscription confirmations, payment failure notices, verification status updates, review notifications, hire follow-ups, and more. All emails come from noreply@nursedex.com or support@nursedex.com.

**What you might need it for:**
- Checking if emails are being delivered
- Viewing email delivery statistics (sent, opened, bounced)
- Troubleshooting if users report not receiving emails
- Managing API keys

**Login:** resend.com, sign in with the nursedexapp account

**Important:** Resend is also configured as the SMTP provider for Supabase, meaning authentication emails (signup confirmation, password reset) also go through Resend. If Resend goes down, users cannot sign up or reset their passwords.

---

## Google Workspace

**What it does:** Google Workspace provides the support@nursedex.com email inbox. This is a real Gmail inbox where you can receive and send emails as support@nursedex.com. It is used for customer support inquiries and receives notifications from the NurseDex admin panel contact form.

**What you might need it for:**
- Reading and responding to customer support emails
- Managing the support inbox

**Login:** Go to gmail.com and sign in with support@nursedex.com

**Important:** This is a separate paid service (~$13/month). The nursedexapp@gmail.com account was merged into this Workspace account during setup, so both email addresses now go to the same inbox.

---

## PostHog

**What it does:** PostHog tracks how people use the NurseDex website. It records events like: how many people signed up, how many searches were performed, which nurses get viewed the most, how many reveals happened, and where people drop off in the signup flow. This data helps you understand what is working and what needs improvement.

**What you might need it for:**
- Viewing usage analytics (signups, searches, reveals, subscriptions)
- Understanding user behavior (what pages people visit, where they leave)
- Tracking growth over time

**Login:** us.posthog.com, sign in with the nursedexapp account

**Important:** PostHog stores personal information, and it is worth being clear about what.

For a signed-in user, PostHog holds an identified profile with their **email address** on it, so their activity can be followed across sessions. Signed-out visitors stay anonymous.

PostHog also records **session replays**: a playback of how a page looked and how the person moved through it. Recordings are masked. Anything typed into a form is hidden, and so is personal information the site displays back, including a nurse's contact details once a family has revealed them. The masking is enforced in code (`src/lib/posthog.ts`, `src/components/ui/private.tsx`), not by a dashboard setting, so it cannot be switched off by accident.

Visitors can opt out of all of it with "Do Not Track" in their browser; we honour it.

This section used to describe PostHog as anonymous and free of names or emails. That was never true, and because this guide said it, nobody went looking. If you change what PostHog collects, update the privacy policy (`src/app/(public)/privacy/page.tsx`) in the same breath.

**Before reading any PostHog number, read `docs/analytics.md` in the code repository.** It covers three
things that are easy to get wrong and have each already produced a wrong conclusion: that
visitor counts are not headcounts, that the database and PostHog answer different questions
and will never reconcile, and that acquisition numbers have to be split by `utm_source`
before any month to month comparison means anything.

If PostHog goes down, the website still works normally. You just lose analytics temporarily.

---

## Sentry

**What it does:** Sentry monitors the website for errors. When something breaks (a page fails to load, a payment fails to process, a database query errors out), Sentry captures the error with details about what went wrong and sends an alert. Think of it as a smoke detector for the website.

**What you might need it for:**
- Checking if there are active errors on the site
- Understanding what went wrong when a user reports a problem
- Sharing error details with a developer to fix issues

**Login:** sentry.io, sign in with the nursedexapp account

**Important:** Sentry captures technical error information. You do not need to understand the error details yourself. If you see errors piling up, contact a developer. If no errors are showing, the site is running normally.

---

## Cloudflare Turnstile

**What it does:** Turnstile is an invisible anti-bot system. It protects NurseDex from spam and abuse. When a family reveals too many nurse profiles too quickly (possible scraping), Turnstile shows a simple verification challenge. It also protects the contact form from spam submissions.

**What you might need it for:**
- You probably will not need to touch this
- If legitimate users report being blocked, the settings can be adjusted

**Login:** dash.cloudflare.com > Turnstile section

**Important:** Turnstile runs invisibly for most users. They never see it unless suspicious behavior is detected. It is completely free.

---

## Google Cloud

**What it does:** Google Cloud provides the "Sign in with Google" feature. When a user clicks "Sign in with Google" on NurseDex, Google Cloud handles the authentication and sends the user's name and email back to NurseDex. That is the only thing it is used for.

**What you might need it for:**
- You probably will not need to touch this
- If "Sign in with Google" stops working, the OAuth credentials may need to be checked here

**Login:** console.cloud.google.com, sign in with the nursedexapp account (now support@nursedex.com). Project name: NurseDex.

**Important:** Google Cloud is free for this use case. There are no charges for OAuth authentication.

---

## GitHub

**What it does:** GitHub stores all the code for NurseDex. Every change ever made to the website is tracked here. When a developer pushes code to GitHub, Vercel automatically picks it up and deploys the updated site.

**What you might need it for:**
- Giving a new developer access to the code
- Viewing the history of code changes
- Managing who has access to the codebase

**Login:** github.com, the repository is at github.com/nursedexapp/nursedex (private)

**Important:** The repository is private, meaning only people you explicitly grant access can see the code. If you need to hire a new developer, add them as a collaborator on this repository.

---

## Domain and DNS

**Domain:** nursedex.com is registered and managed through Vercel.

**DNS records** (what connects everything):
- Website hosting points to Vercel
- Email (MX records) points to Google Workspace
- Email sending (SPF, DKIM) configured for Resend
- Google site verification TXT record

**Important:** Do not modify DNS records unless you know what you are doing. Incorrect DNS changes can break the website, email, or both.

---

## Status Pages

If something seems broken, check these status pages to see if a service is having an outage:

- **Vercel:** status.vercel.com
- **Supabase:** status.supabase.com
- **Stripe:** status.stripe.com
- **Resend:** status.resend.com
- **Sentry:** status.sentry.io

These are also subscribed to in Slack for automatic notifications.

---

## Business Information

- **LLC:** NurseDex LLC
- **Address:** 2197 Louis Kossuth Avenue, Ronkonkoma, NY 11779
- **Support email:** support@nursedex.com
- **Domain:** nursedex.com (registered through Vercel)
- **Refund policy:** No refunds. Customers can cancel anytime to stop future billing.

---

## If Something Goes Wrong

1. **Website is down:** Check status.vercel.com. If Vercel is fine, check Supabase status. If both are fine, the issue is likely in the code and needs a developer.

2. **Users cannot sign up or log in:** Check Supabase status and Resend status. Authentication depends on both services.

3. **Payments are not processing:** Check Stripe dashboard for failed payments or errors. Check status.stripe.com for outages.

4. **Emails are not sending:** Check Resend dashboard for delivery failures. Check that the API key has not expired.

5. **Users report being blocked:** Check Cloudflare Turnstile settings. A legitimate user may have triggered the anti-bot protection.

6. **Need to hire a developer:** Give them access to the GitHub repository (github.com/nursedexapp/nursedex) and share the Vercel project. Point them to the implementation plan at Documents/NurseDex_Decisions.md in the codebase.

---

## Monthly Costs Summary

| Service | Cost |
|---------|------|
| Vercel (Pro) | Included in current plan |
| Supabase (Free) | $0 (upgrade to $25/month before launch) |
| Stripe | 2.9% + $0.30 per transaction (no monthly fee) |
| Resend (Free tier) | $0 |
| Google Workspace | ~$13/month |
| PostHog (Free tier) | $0 |
| Sentry (Free tier) | $0 |
| Cloudflare Turnstile | $0 |
| Google Cloud | $0 |
| **Total fixed costs** | **~$13/month** (before Supabase upgrade) |
