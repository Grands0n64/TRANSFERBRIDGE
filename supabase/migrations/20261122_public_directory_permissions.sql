-- TRANSFERBRIDGE: repair public directory permissions and protect contact details.
-- Safe to run repeatedly in Supabase SQL Editor.

-- Public directory endpoint may read only verified staff submissions.
grant select on public.club_staff to anon, authenticated;
drop policy if exists "Verified club staff are publicly viewable" on public.club_staff;
create policy "Verified club staff are publicly viewable"
  on public.club_staff for select to anon, authenticated
  using (verified = true);

-- Never expose direct email/phone columns on the base contacts table.
drop policy if exists "Public can view sourced club contacts" on public.club_contacts;
revoke all on public.club_contacts from anon, authenticated;

-- Explicitly grant access to the safe view (which omits email and phone).
grant select on public.public_club_contacts to anon, authenticated;
