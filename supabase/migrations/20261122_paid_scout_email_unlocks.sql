-- Paid, per-scout email unlocks. Email addresses remain server-only.
create table if not exists public.scout_contact_unlocks (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 contact_id uuid not null references public.club_contacts(id) on delete cascade,
 payment_reference text not null unique,
 amount_kobo integer not null check (amount_kobo > 0),
 currency text not null default 'NGN' check (currency = 'NGN'),
 status text not null default 'pending' check (status in ('pending','paid','failed')),
 paid_at timestamptz,
 scout_notified_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id, contact_id)
);
alter table public.scout_contact_unlocks enable row level security;
revoke all on public.scout_contact_unlocks from anon, authenticated;
drop policy if exists "Users can view own scout email unlocks" on public.scout_contact_unlocks;
create policy "Users can view own scout email unlocks"
 on public.scout_contact_unlocks for select to authenticated
 using (auth.uid() = user_id);
grant select on public.scout_contact_unlocks to authenticated;
grant all on public.scout_contact_unlocks to service_role;
