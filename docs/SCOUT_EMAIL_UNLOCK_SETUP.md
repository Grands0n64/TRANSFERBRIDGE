# TRANSFERBRIDGE paid scout email unlock

## Database
Run `supabase/migrations/20261122_paid_scout_email_unlocks.sql` in the Supabase SQL Editor.

The migration creates a private payment/unlock ledger. It does not expose contact email addresses through the public directory view.

## Vercel environment variables

Set these in **Vercel → Project → Settings → Environment Variables**, then redeploy:

- `SUPABASE_URL` — existing Supabase project URL.
- `SUPABASE_ANON_KEY` — existing Supabase anon/public key.
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role key. Server-side only; never expose it in browser code.
- `PAYSTACK_SECRET_KEY` — Paystack secret key. Server-side only.
- `SCOUT_EMAIL_UNLOCK_PRICE_KOBO` — price per scout email in kobo. Example: `100000` = ₦1,000.
- `TRANSFERBRIDGE_SITE_URL` — canonical deployed site origin, e.g. `https://your-domain.example`.

Do not put secret keys in `index.html`, `live.js`, or any `NEXT_PUBLIC_*` variable.

## Payment and release behaviour

1. The public scout directory shows TRANSFERBRIDGE members and sourced external club scouting professionals.
2. Email addresses are never returned by the public directory endpoint.
3. A logged-in member selects **Unlock scout email** and is redirected to Paystack.
4. The callback verifies the transaction directly with Paystack, checks its reference, amount, currency and metadata against the server-side unlock record, then marks it paid.
5. Only after that verification does the authenticated member's directory request return the email address.
6. Scout outreach is handled manually by the TRANSFERBRIDGE owner using their own email. No email-sending service or sender domain is required.

The current code still uses the existing Paystack/NGN integration. This is not the final payment setup requested for EUR/GBP checkout; do not launch payments until the provider and customer-facing currencies have been changed and tested. Configure the unlock price before launch.
