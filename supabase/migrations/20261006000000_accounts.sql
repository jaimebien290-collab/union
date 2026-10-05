-- LOT 1 — Compte et profil : inscription (F-AUTH-01 à 05), suppression (F-AUTH-08), export (F-AUTH-10), photos (F-PROF-01).

-- Le profil survit à la suppression du compte (anonymisé, pour garder « Utilisateur supprimé » dans les
-- messages) alors que la ligne auth.users, elle, est réellement supprimée : plus de clé étrangère entre les deux.
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles alter column email drop not null;

-- avatar_url est un chemin dans le bucket « avatars », forcément dans le dossier de son propriétaire.
alter table public.profiles
  add constraint profiles_avatar_path check (avatar_url is null or avatar_url like id::text || '/%');

-- Codes des catégories (§6.3). À garder synchronisé avec CATEGORIES dans packages/shared.
create function private.category_codes() returns text[]
language sql immutable as $$
  select array['sport', 'outings', 'parties', 'travel', 'culture', 'study', 'food', 'games', 'other'];
$$;

alter table public.profiles
  add constraint profiles_interests_valid
  check (interests <@ private.category_codes() and cardinality(interests) <= 5);

-- INSCRIPTION ------------------------------------------------------------------

-- L'écran « Infos perso » a besoin de la liste des formations avant que le profil existe :
-- check_school_domain la renvoie aussi.
drop function public.check_school_domain(text);

create function public.check_school_domain(p_email text)
returns table (school_id uuid, school_name text, programs jsonb)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, coalesce(s.settings -> 'programs', '[]'::jsonb)
  from public.schools s
  where s.is_active
    and position('@' in p_email) > 1
    and lower(split_part(trim(p_email), '@', 2)) = any (s.email_domains)
  limit 1;
$$;

revoke all on function public.check_school_domain(text) from public;
grant execute on function public.check_school_domain(text) to anon, authenticated;

-- Hook Supabase Auth « Before User Created » : refuse tout email hors école partenaire, même si quelqu'un
-- appelle l'API d'authentification sans passer par l'app (F-AUTH-01, D6). À activer dans Auth → Hooks.
create function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.check_school_domain(event -> 'user' ->> 'email')) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'school_not_found'));
end;
$$;

revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- F-AUTH-04 : inscription abandonnée (mineur) → aucune donnée conservée. Sans effet si un profil existe.
create function public.abandon_signup() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not exists (select 1 from public.profiles where id = auth.uid()) then
    delete from auth.users where id = auth.uid();
  end if;
end;
$$;

-- Crée le profil après vérification de l'email. Renvoie 'ok' ou 'underage' (compte supprimé dans ce cas :
-- on ne lève pas d'exception, elle annulerait la suppression). Les autres refus lèvent une exception dont
-- le message est un code repris par l'app.
create function public.complete_signup(
  p_first_name text,
  p_last_name text,
  p_birth_date date,
  p_program text,
  p_study_year int,
  p_is_newcomer boolean,
  p_interests text[],
  p_accept_terms boolean
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_school_id uuid;
  v_programs jsonb;
  v_program text := nullif(trim(p_program), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select email into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then
    raise exception 'email_not_verified';
  end if;

  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_exists';
  end if;

  if p_birth_date is null then
    raise exception 'birth_date_required';
  end if;

  if p_birth_date > (current_date - interval '18 years')::date then
    delete from auth.users where id = v_uid;
    return 'underage';
  end if;

  select c.school_id into v_school_id from public.check_school_domain(v_email) c;
  if v_school_id is null then
    raise exception 'school_not_found';
  end if;

  if p_accept_terms is not true then
    raise exception 'terms_required';
  end if;

  if char_length(trim(coalesce(p_first_name, ''))) not between 1 and 50
     or char_length(trim(coalesce(p_last_name, ''))) not between 1 and 50 then
    raise exception 'name_invalid';
  end if;

  -- Si l'école a défini sa liste de formations, on n'accepte que celles-là.
  select settings -> 'programs' into v_programs from public.schools where id = v_school_id;
  if jsonb_typeof(v_programs) = 'array' and jsonb_array_length(v_programs) > 0
     and (v_program is null or not v_programs ? v_program) then
    raise exception 'program_invalid';
  end if;

  insert into public.profiles
    (id, school_id, first_name, last_name, email, birth_date, program, study_year, is_newcomer, interests, cgu_accepted_at)
  values
    (v_uid, v_school_id, trim(p_first_name), trim(p_last_name), lower(v_email), p_birth_date, v_program,
     p_study_year, coalesce(p_is_newcomer, false), coalesce(p_interests, '{}'), now());

  return 'ok';
end;
$$;

-- SUPPRESSION ET EXPORT ----------------------------------------------------------

-- F-AUTH-08 : le profil est anonymisé, le compte d'authentification (email, mot de passe) est supprimé.
-- La photo est supprimée par l'app via l'API Storage juste avant l'appel.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles set
    first_name = 'Utilisateur',
    last_name = 'supprimé',
    email = null,
    birth_date = date '1900-01-01',
    program = null,
    study_year = null,
    is_newcomer = false,
    bio = null,
    avatar_url = null,
    interests = '{}',
    role = 'student',
    is_mentor = false,
    mentor_capacity = 0,
    points_balance = 0,
    notification_prefs = '{}'::jsonb,
    status = 'deleted'
  where id = v_uid;

  delete from public.push_tokens where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

-- F-AUTH-10 : tout ce qu'UNION détient sur moi. À compléter à chaque lot qui ajoute des données personnelles.
create function public.export_my_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'school', (select s.name from public.schools s join public.profiles p on p.school_id = s.id where p.id = auth.uid()),
    'push_devices', (select coalesce(jsonb_agg(jsonb_build_object('platform', t.platform, 'created_at', t.created_at)), '[]'::jsonb)
                     from public.push_tokens t where t.user_id = auth.uid())
  );
$$;

revoke all on function public.abandon_signup() from public, anon;
revoke all on function public.complete_signup(text, text, date, text, int, boolean, text[], boolean) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.abandon_signup() to authenticated;
grant execute on function public.complete_signup(text, text, date, text, int, boolean, text[], boolean) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.export_my_data() to authenticated;

-- PHOTOS DE PROFIL ---------------------------------------------------------------

-- Bucket privé, 5 Mo max (F-PROF-01). Chemin : {id utilisateur}/{fichier}.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, '{image/jpeg,image/png,image/webp}')
on conflict (id) do nothing;

-- Lecture : seulement les photos des profils que je peux voir (même école, compte actif).
create policy avatars_select_same_school on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and exists (select 1 from public.public_profiles p where p.id::text = (storage.foldername(name))[1])
  );

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and private.current_school_id() is not null
  );

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
