-- LOT 0 — Fondations : écoles, profils, jetons push, cloisonnement par école (NF-SEC-01).
-- Règle : toute table a la RLS activée et des privilèges explicites (revoke all, puis grant ciblés).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ÉCOLES ---------------------------------------------------------------------

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  email_domains text[] not null check (cardinality(email_domains) > 0),
  campus_address text,
  campus_lat double precision,
  campus_lng double precision,
  declared_student_count int check (declared_student_count >= 0),
  is_active boolean not null default true,
  subscription_ends_at date,
  settings jsonb not null default '{"mentoring_enabled": true}'::jsonb,
  created_at timestamptz not null default now()
);

-- Les domaines sont stockés en minuscules : la comparaison F-AUTH-01 est insensible à la casse.
create function private.normalize_school_domains() returns trigger
language plpgsql as $$
begin
  new.email_domains := array(select lower(trim(d)) from unnest(new.email_domains) as d);
  return new;
end;
$$;

create trigger schools_normalize_domains
  before insert or update of email_domains on public.schools
  for each row execute function private.normalize_school_domains();

-- PROFILS (1-1 avec auth.users) ------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  school_id uuid not null references public.schools (id),
  first_name text not null,
  last_name text not null,
  email text not null,
  birth_date date not null,
  program text,
  study_year smallint check (study_year between 1 and 8),
  is_newcomer boolean not null default false,
  bio varchar(150),
  avatar_url text,
  interests text[] not null default '{}',
  role text not null default 'student'
    check (role in ('student', 'ambassador', 'school_admin', 'super_admin')),
  is_mentor boolean not null default false,
  mentor_capacity smallint not null default 0 check (mentor_capacity between 0 and 3),
  points_balance int not null default 0,
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  notification_prefs jsonb not null default '{}'::jsonb,
  cgu_accepted_at timestamptz not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index profiles_school_id_idx on public.profiles (school_id);

-- D10 / F-AUTH-04 : pas de mineurs. Un trigger plutôt qu'un check, car la règle dépend de la date du jour.
create function private.enforce_min_age() returns trigger
language plpgsql as $$
begin
  if new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'UNION est réservé aux 18 ans et plus' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_min_age
  before insert or update of birth_date on public.profiles
  for each row execute function private.enforce_min_age();

-- JETONS PUSH ------------------------------------------------------------------

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now()
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

-- FONCTIONS D'APPUI POUR LA RLS ------------------------------------------------
-- security definer : elles lisent profiles sans repasser par ses policies (pas de récursion).
-- Un compte suspendu ou supprimé n'a plus d'école courante, donc ne voit plus rien.

create function private.current_school_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select school_id from public.profiles where id = auth.uid() and status = 'active';
$$;

create function private.current_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and status = 'active';
$$;

revoke all on function private.current_school_id() from public;
revoke all on function private.current_role() from public;
grant execute on function private.current_school_id() to authenticated;
grant execute on function private.current_role() to authenticated;

-- RLS ET PRIVILÈGES --------------------------------------------------------------

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.push_tokens enable row level security;

revoke all on public.schools, public.profiles, public.push_tokens from anon, authenticated;

-- schools : un étudiant lit son école, sans les colonnes contractuelles (effectif, abonnement, domaines).
grant select (id, name, slug, logo_url, campus_address, campus_lat, campus_lng, is_active, settings)
  on public.schools to authenticated;

create policy schools_select_own on public.schools
  for select to authenticated
  using (id = private.current_school_id());

-- profiles : la ligne complète n'est lisible que par son propriétaire.
-- Les autres étudiants passent par la vue public_profiles (colonnes publiques uniquement, F-PROF-02).
grant select on public.profiles to authenticated;
grant update (first_name, last_name, program, study_year, is_newcomer, bio, avatar_url, interests, notification_prefs)
  on public.profiles to authenticated;
-- Pas de insert/delete : création par complete_signup (lot 1), suppression par anonymisation (F-AUTH-08).
-- role, points_balance, status, is_mentor, school_id, email : modifiables par fonction serveur uniquement.

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() and status = 'active')
  with check (id = auth.uid());

-- Vue volontairement en security definer (security_invoker = false) : c'est elle qui porte le filtre
-- « même école + compte actif » et qui limite les colonnes exposées.
create view public.public_profiles
with (security_invoker = false, security_barrier = true) as
  select id, school_id, first_name, last_name, program, study_year, bio, avatar_url, interests, role, is_mentor
  from public.profiles
  where status = 'active'
    and school_id = private.current_school_id();

revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;

-- push_tokens : chacun gère les siens.
grant select, insert, update, delete on public.push_tokens to authenticated;

create policy push_tokens_own on public.push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- INSCRIPTION --------------------------------------------------------------------

-- F-AUTH-01 : appelée avant l'envoi de l'OTP, donc accessible sans session.
-- Ne renvoie que l'identifiant et le nom d'une école active ; aucune ligne si le domaine est inconnu.
create function public.check_school_domain(p_email text)
returns table (school_id uuid, school_name text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name
  from public.schools s
  where s.is_active
    and position('@' in p_email) > 1
    and lower(split_part(trim(p_email), '@', 2)) = any (s.email_domains)
  limit 1;
$$;

revoke all on function public.check_school_domain(text) from public;
grant execute on function public.check_school_domain(text) to anon, authenticated;
