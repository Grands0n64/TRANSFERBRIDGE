# TRANSFERBRIDGE

International football discovery and recruitment network for players, scouts, agents, clubs and verified club medical/scouting staff.

## Included

- Responsive TRANSFERBRIDGE website
- Supabase email/password account registration and login integration
- Role-based profile foundation: player, scout, agent, club and medical
- Player profile, scouting report, submission and private media database schema
- Live club lookup and squad retrieval API endpoints using API-SPORTS / API-Football
- Verified club staff directory for scouts, head scouts, recruitment staff, team doctors, medical directors and physiotherapists
- Vercel serverless API routes

## Required setup before live accounts and live data work

This repository is prepared for live services, but it cannot connect to accounts you have not created/configured. Do these setup steps in your Supabase and Vercel dashboards.

### 1. Supabase

1. Create a Supabase project.
2. Open **SQL Editor** and run all of `supabase/schema.sql`.
3. In Supabase **Project Settings → API**, copy the Project URL and anon/public key.
4. In Supabase **Authentication → URL Configuration**, add your deployed Vercel domain to Site URL and Redirect URLs.

### 2. Vercel environment variables

Add these variables under Project → Settings → Environment Variables, for Production and Preview:

- `SUPABASE_URL` — your Supabase project URL
- `SUPABASE_ANON_KEY` — your Supabase anon/public key
- `API_FOOTBALL_KEY` — your API-SPORTS / API-Football key

Redeploy after saving environment variables. Never put a Supabase service-role key or football provider secret in browser JavaScript.

### 3. Real football squad data

The live search first finds the club using API-FOOTBALL and then retrieves the provider's current squad endpoint. Coverage and available seasons depend on your API plan and provider data. This is a real external data integration, not a hand-written player list. A player appearing in a squad feed does not prove contract status, fitness or transfer availability.

### 4. Scouts and club doctors

Public football squad APIs do not reliably publish complete scouting departments or medical staff. TRANSFERBRIDGE therefore uses the `club_staff` database table and displays only entries with `verified = true` and a supporting source URL. Staff entries must be researched, submitted and reviewed before being shown. Do not invent names, titles or contact details.

### 5. Security and production checklist

- Review Supabase Row Level Security policies before onboarding real users.
- Configure email confirmation and password reset email templates.
- Add an admin-only verification workflow before accepting staff verification or public club claims.
- Review consent, privacy, retention and child-player safeguarding requirements before accepting under-18 profiles.
- Add rate limits, abuse reporting, moderation and audit logs before public launch.
- Configure a private storage bucket and signed URL workflow for sensitive player documents and videos.

## Deployment

Deploy this repository to Vercel with Framework Preset **Other**. No build command is required. Root directory is `./`.

## Honest current status

The code contains the live-service integration points and database schema, but the external services are not active until the owner supplies the Supabase and API-FOOTBALL credentials and runs the SQL setup. No real player, scout, doctor or club contact names are fabricated. The existing eight-league club list remains a starter list and must be verified against official 2026/27 league registrations before being marketed as a complete official directory.

TRANSFERBRIDGE does not guarantee trials, contracts, transfers or medical/recruitment endorsements.
