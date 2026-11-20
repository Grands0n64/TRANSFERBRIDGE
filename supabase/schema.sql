-- TRANSFERBRIDGE production foundation
-- Run this file in Supabase SQL Editor after creating a Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('player','scout','agent','club','medical')),
  country text,
  profile_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Profiles are viewable by authenticated users" on public.profiles for select to authenticated using (true);
create policy "Users create their own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users update their own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.player_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  date_of_birth date,
  nationality text,
  position text,
  current_club text,
  preferred_foot text,
  height_cm integer,
  highlight_url text,
  bio text,
  updated_at timestamptz not null default now()
);
alter table public.player_profiles enable row level security;
create policy "Player profiles viewable by authenticated users" on public.player_profiles for select to authenticated using (true);
create policy "Players manage own profile" on public.player_profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.club_staff (
  id uuid primary key default gen_random_uuid(),
  club_name text not null,
  full_name text not null,
  role text not null check (role in ('scout','head_scout','chief_scout','doctor','team_doctor','medical_director','physiotherapist','head_of_recruitment','other')),
  department text,
  profile_url text,
  source_url text not null,
  verified boolean not null default false,
  submitted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.club_staff enable row level security;
create policy "Verified club staff are public to authenticated users" on public.club_staff for select to authenticated using (verified = true);
create policy "Authenticated users can submit staff for review" on public.club_staff for insert to authenticated with check (auth.uid() = submitted_by and verified = false);

create table if not exists public.scouting_reports (
  id uuid primary key default gen_random_uuid(),
  scout_id uuid not null references public.profiles(id),
  player_name text not null,
  club_name text,
  position text,
  assessment text not null,
  recommendation text,
  visibility text not null default 'private' check (visibility in ('private','shared')),
  created_at timestamptz not null default now()
);
alter table public.scouting_reports enable row level security;
create policy "Scouts manage own reports" on public.scouting_reports for all to authenticated using (auth.uid() = scout_id) with check (auth.uid() = scout_id);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references public.profiles(id),
  club_name text not null,
  player_name text not null,
  message text,
  status text not null default 'submitted' check (status in ('submitted','reviewing','trial','declined','completed')),
  created_at timestamptz not null default now()
);
alter table public.submissions enable row level security;
create policy "Users see their own submissions" on public.submissions for select to authenticated using (auth.uid() = submitted_by);
create policy "Users create submissions" on public.submissions for insert to authenticated with check (auth.uid() = submitted_by);

-- Private storage bucket for player documents/highlights. Set bucket public=false.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-media','player-media',false,52428800,array['image/jpeg','image/png','application/pdf','video/mp4','video/quicktime'])
on conflict (id) do nothing;
create policy "Authenticated users upload own player media" on storage.objects for insert to authenticated with check (bucket_id = 'player-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Authenticated users read player media" on storage.objects for select to authenticated using (bucket_id = 'player-media');
