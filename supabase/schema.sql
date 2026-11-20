-- TRANSFERBRIDGE database migration (safe to run more than once)
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null,
 role text not null,
 country text,
 profile_url text,
 created_at timestamptz not null default now()
);
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
 check (role in ('player','scout','agent','club','medical','coach','executive','analyst','other'));
alter table public.profiles enable row level security;

create table if not exists public.player_profiles (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 date_of_birth date, nationality text, position text, current_club text,
 preferred_foot text, height_cm integer, highlight_url text, bio text,
 updated_at timestamptz not null default now()
);
alter table public.player_profiles enable row level security;

create table if not exists public.scout_profiles (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 organisation text, territory text, positions text, age_groups text,
 bio text, credentials_url text,
 verified boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.scout_profiles enable row level security;

create table if not exists public.club_staff (
 id uuid primary key default gen_random_uuid(),
 club_name text not null, full_name text not null, role text not null,
 department text, profile_url text, source_url text not null,
 verified boolean not null default false,
 submitted_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.club_staff enable row level security;

create table if not exists public.player_applications (
 id uuid primary key default gen_random_uuid(),
 submitted_by uuid not null references public.profiles(id) on delete cascade,
 scout_id uuid references public.profiles(id),
 player_name text not null,
 date_of_birth date,
 nationality text not null,
 position text not null,
 current_club text,
 preferred_foot text,
 height_cm integer,
 bio text,
 message text,
 cv_path text,
 highlight_path text,
 match_path text,
 status text not null default 'submitted'
  check (status in ('submitted','reviewing','forwarded','contacted','trial','declined','completed')),
 review_notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.player_applications enable row level security;

create table if not exists public.scouting_reports (
 id uuid primary key default gen_random_uuid(),
 scout_id uuid not null references public.profiles(id),
 player_name text not null, club_name text, position text,
 assessment text not null, recommendation text,
 visibility text not null default 'private' check (visibility in ('private','shared')),
 created_at timestamptz not null default now()
);
alter table public.scouting_reports enable row level security;

create table if not exists public.submissions (
 id uuid primary key default gen_random_uuid(),
 submitted_by uuid not null references public.profiles(id),
 club_name text not null, player_name text not null, message text,
 status text not null default 'submitted'
  check (status in ('submitted','reviewing','trial','declined','completed')),
 created_at timestamptz not null default now()
);
alter table public.submissions enable row level security;

-- Remove earlier policy names so this migration can be rerun.
drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
drop policy if exists "Users create their own profile" on public.profiles;
drop policy if exists "Users update their own profile" on public.profiles;
create policy "Profiles are viewable by authenticated users" on public.profiles for select to authenticated using (true);
create policy "Users create their own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users update their own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Player profiles viewable by authenticated users" on public.player_profiles;
drop policy if exists "Players manage own profile" on public.player_profiles;
create policy "Player profiles viewable by authenticated users" on public.player_profiles for select to authenticated using (true);
create policy "Players manage own profile" on public.player_profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Scout directory visible to members" on public.scout_profiles;
drop policy if exists "Scouts manage own profile" on public.scout_profiles;
drop policy if exists "Scouts create unverified profile" on public.scout_profiles;
drop policy if exists "Scouts update unverified profile" on public.scout_profiles;
create policy "Scout directory visible to members" on public.scout_profiles for select to authenticated using (verified = true or auth.uid() = user_id);
create policy "Scouts create unverified profile" on public.scout_profiles for insert to authenticated with check (auth.uid() = user_id and verified = false);
create policy "Scouts update unverified profile" on public.scout_profiles for update to authenticated using (auth.uid() = user_id and verified = false) with check (auth.uid() = user_id and verified = false);

drop policy if exists "Verified club staff are publicly viewable" on public.club_staff;
drop policy if exists "Authenticated users can submit staff for review" on public.club_staff;
create policy "Verified club staff are publicly viewable" on public.club_staff for select to anon, authenticated using (verified = true);
create policy "Authenticated users can submit staff for review" on public.club_staff for insert to authenticated with check (auth.uid() = submitted_by and verified = false);

drop policy if exists "Players create own applications" on public.player_applications;
drop policy if exists "Players and assigned scouts view applications" on public.player_applications;
drop policy if exists "Players update own applications" on public.player_applications;
create policy "Players create own applications" on public.player_applications for insert to authenticated with check (auth.uid() = submitted_by);
create policy "Players and assigned scouts view applications" on public.player_applications for select to authenticated using (auth.uid() = submitted_by or auth.uid() = scout_id);

drop policy if exists "Scouts manage own reports" on public.scouting_reports;
create policy "Scouts manage own reports" on public.scouting_reports for all to authenticated using (auth.uid() = scout_id) with check (auth.uid() = scout_id);

drop policy if exists "Users see their own submissions" on public.submissions;
drop policy if exists "Users create submissions" on public.submissions;
create policy "Users see their own submissions" on public.submissions for select to authenticated using (auth.uid() = submitted_by);
create policy "Users create submissions" on public.submissions for insert to authenticated with check (auth.uid() = submitted_by);

-- Private bucket: each user uploads into a folder named with their auth UUID.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('player-media','player-media',false,209715200,
 array['image/jpeg','image/png','application/pdf','video/mp4','video/quicktime'])
on conflict (id) do update set file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Authenticated users upload own player media" on storage.objects;
drop policy if exists "Authenticated users read player media" on storage.objects;
create policy "Authenticated users upload own player media" on storage.objects for insert to authenticated
with check (bucket_id='player-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Authenticated users read player media" on storage.objects for select to authenticated
using (bucket_id='player-media' and (storage.foldername(name))[1]=auth.uid()::text);

-- NOTE: review/verification status changes are reserved for trusted admin tooling.


-- PUBLIC FOOTBALL CONTACT DIRECTORY
create table if not exists public.club_contacts (
 id uuid primary key default gen_random_uuid(),
 league text not null,
 club_name text not null,
 contact_name text,
 job_title text,
 department text not null,
 email text,
 phone text,
 contact_url text,
 source_url text not null,
 source_type text not null default 'official',
 verification_status text not null default 'source-listed'
  check (verification_status in ('official-source','source-listed','needs-review')),
 notes text,
 created_at timestamptz not null default now(),
 unique (club_name, contact_name, department, email)
);
alter table public.club_contacts enable row level security;
drop policy if exists "Public can view sourced club contacts" on public.club_contacts;
create policy "Public can view sourced club contacts" on public.club_contacts
 for select to anon, authenticated using (true);

-- Publicly published official contact routes. A general club contact is
-- deliberately labelled as such; it is not represented as a scout's inbox.
insert into public.club_contacts
 (league,club_name,contact_name,job_title,department,email,phone,contact_url,source_url,source_type,verification_status,notes)
values
 ('La Liga','Real Madrid','', 'Football trials enquiries','Football trials','pruebasfutbol@corp.realmadrid.com',null,'https://www.realmadrid.com/en-US/the-club/contact','https://www.realmadrid.com/en-US/the-club/contact','official','official-source','Official football trials contact published by Real Madrid. Not a named scout email.'),
 ('Ligue 1','OGC Nice','', 'Scouting department','Scouting & recruitment','recrutement@ogcnice.com','+33 4 93 71 93 52','https://www.ogcnice.com/en/the-club/contacts.html','https://www.ogcnice.com/en/the-club/contacts.html','official','official-source','Official club page lists this address under Scouting.'),
 ('Serie A','AS Roma','', 'General club enquiries','Club contact','callcenter@asroma.it','+39 06 8938 6000','https://www.asroma.com/en/club/contact-us','https://www.asroma.com/en/club/contact-us','official','official-source','Official general customer-service contact, not a scouting mailbox. Academy contact: segreteria.sg@asroma.it.'),
 ('Bundesliga','Bundesliga (league office)','', 'League enquiries','League office','info@bundesliga.de',null,'https://www.bundesliga.com/en/bundesliga/info/contact','https://www.bundesliga.com/en/bundesliga/info/contact','official','official-source','League office contact, not an individual club scouting contact.'),
 ('Ligue 1','Ligue de Football Professionnel (league office)','', 'League enquiries','League office','hello@ligue1.fr','+33 1 53 65 38 00','https://ligue1.com/en/contact-us','https://ligue1.com/en/contact-us','official','official-source','League organiser contact, not an individual club scouting contact.'),
 ('Serie A','Lega Serie A (league office)','', 'Presidency secretariat','League office','presidenza@legaseriea.it','+39 02 699101', 'https://www.legaseriea.it/lega-serie-a/sedi-e-contatti','https://www.legaseriea.it/lega-serie-a/sedi-e-contatti','official','official-source','League organiser contact, not an individual club scouting contact.')
on conflict do nothing;

-- Publicly named scouting professionals from a third-party football contacts
-- directory. Direct email/phone is not exposed in the public preview; do not guess.
insert into public.club_contacts
 (league,club_name,contact_name,job_title,department,email,phone,contact_url,source_url,source_type,verification_status,notes)
values
 ('Ligue 1','Paris Saint-Germain','Omar Allel','Scout','Scouting & recruitment',null,null,'https://footycontacts.com/football-contacts/league/ligue-1/scouts','https://footycontacts.com/football-contacts/league/ligue-1/scouts','third-party','source-listed','Named in public scout directory preview; direct contact details not publicly displayed.'),
 ('Ligue 1','Stade Rennais FC','Philippe Barraud','Head of Youth Scouting','Scouting & recruitment',null,null,'https://footycontacts.com/football-contacts/league/ligue-1/scouts','https://footycontacts.com/football-contacts/league/ligue-1/scouts','third-party','source-listed','Named in public scout directory preview; direct contact details not publicly displayed.'),
 ('Ligue 1','Stade Rennais FC','Bruno Paterno','Scout','Scouting & recruitment',null,null,'https://footycontacts.com/football-contacts/league/ligue-1/scouts','https://footycontacts.com/football-contacts/league/ligue-1/scouts','third-party','source-listed','Named in public scout directory preview; direct contact details not publicly displayed.'),
 ('Ligue 1','Stade Rennais FC','Mathieu Coutadeur','Scout','Scouting & recruitment',null,null,'https://footycontacts.com/football-contacts/league/ligue-1/scouts','https://footycontacts.com/football-contacts/league/ligue-1/scouts','third-party','source-listed','Named in public scout directory preview; direct contact details not publicly displayed.'),
 ('Serie A','AC Milan','Tiago Estêvão','Head of Scouting','Scouting & recruitment',null,null,'https://footycontacts.com/football-contacts/league/serie-a/scouts','https://footycontacts.com/football-contacts/league/serie-a/scouts','third-party','source-listed','Named in public scout directory preview; direct contact details not publicly displayed.'),
 ('Serie A','FC Internazionale Milano','Corrado Verdelli','Chief Scout','Scouting & recruitment',null,null,'https://footycontacts.com/football-contacts/league/serie-a/scouts','https://footycontacts.com/football-contacts/league/serie-a/scouts','third-party','source-listed','Named in public scout directory preview; direct contact details not publicly displayed.'),
 ('La Liga','Real Madrid','Juan San Segundo','Scouting','Scouting & recruitment',null,null,'https://www.footycontacts.com/football-contacts/league/spain-primera-division/scouts','https://www.footycontacts.com/football-contacts/league/spain-primera-division/scouts','third-party','source-listed','Named in public scout directory preview; direct contact details not publicly displayed.'),
 ('La Liga','Atlético de Madrid','Hector Antelo Renones','International Scout','Scouting & recruitment',null,null,'https://www.footycontacts.com/football-contacts/league/spain-primera-division/scouts','https://www.footycontacts.com/football-contacts/league/spain-primera-division/scouts','third-party','source-listed','Named in public scout directory preview; direct contact details not publicly displayed.')
on conflict do nothing;
