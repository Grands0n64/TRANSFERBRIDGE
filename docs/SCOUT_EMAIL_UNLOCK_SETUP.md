# TRANSFERBRIDGE scout email access

## Current status

Scout email unlocking is temporarily paused. No payment provider, checkout currency, payment key, or unlock price is configured. The directory can continue showing sourced scout listings, but external scout email addresses remain locked.

TRANSFERBRIDGE will contact scouts manually using its own email after a future payment process has been selected and confirmed.

## Existing Supabase configuration

The project already has `SUPABASE_URL` and `SUPABASE_ANON_KEY` configured in Vercel. Do not add them again.

The server-side scout directory currently also uses `SUPABASE_SERVICE_ROLE_KEY`, which must remain a Vercel server-only environment variable if it has not already been added. Never expose it in browser code or commit it to GitHub.

## Do not configure yet

Do not add Paystack, Flutterwave, Resend, sender-domain, currency, or unlock-price environment variables. No payment integration is active.

Do not run the paid-unlock migration for a new payment setup until the payment provider and data model are agreed.
