-- LOT 2 — Activités : création, inscription, liste d'attente, modification, annulation (F-ACT-01 à 09, 11).
-- Le check-in (F-ACT-10) arrive au lot 4, l'envoi réel des push au lot 3 : ici on remplit seulement la file.

-- FILE DE NOTIFICATIONS --------------------------------------------------------
-- Les fonctions serveur y déposent les notifications à envoyer ; l'envoi push les consommera (sent_at).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unsent_idx on public.notifications (created_at) where sent_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

-- ACTIVITÉS --------------------------------------------------------------------

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  creator_id uuid not null references public.profiles (id),
  title text not null check (char_length(trim(title)) between 5 and 80),
  description text check (char_length(description) <= 1000),
  category text not null check (category = any (private.category_codes())),
  is_official boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location_name text not null check (char_length(trim(location_name)) between 1 and 120),
  address text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  max_participants int check (max_participants between 2 and 500),
  cover_url text,
  status text not null default 'published' check (status in ('published', 'cancelled', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint activities_cover_path
    check (cover_url is null or cover_url like school_id::text || '/' || creator_id::text || '/%')
);

create index activities_feed_idx on public.activities (school_id, starts_at) where status = 'published';
create index activities_creator_idx on public.activities (creator_id, created_at);

create table public.activity_participants (
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  school_id uuid not null references public.schools (id),
  status text not null check (status in ('registered', 'waitlisted', 'cancelled')),
  -- Numéro d'ordre croissant dans la file, jamais renuméroté : le plus petit est le prochain promu.
  waitlist_position int,
  checked_in_at timestamptz,
  checkin_method text check (checkin_method in ('qr', 'manual')),
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create index activity_participants_user_idx on public.activity_participants (user_id, status);

-- Règles de création (F-ACT-01, 02, 05 ; NF-SEC-04). L'auteur et l'école viennent de la session, jamais du client.
create function private.activities_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.creator_id := auth.uid();
  new.school_id := private.current_school_id();
  new.status := 'published';
  new.title := trim(new.title);
  new.ends_at := coalesce(new.ends_at, new.starts_at + interval '2 hours');

  if new.school_id is null then
    raise exception 'not_authenticated';
  end if;
  if new.starts_at < now() + interval '30 minutes' or new.starts_at > now() + interval '6 months' then
    raise exception 'start_out_of_range';
  end if;
  if new.is_official and private.current_role() not in ('ambassador', 'school_admin') then
    raise exception 'official_not_allowed';
  end if;
  if (select count(*) from public.activities
      where creator_id = new.creator_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many_activities';
  end if;
  return new;
end;
$$;

create trigger activities_before_insert
  before insert on public.activities
  for each row execute function private.activities_before_insert();

-- P3 : l'organisateur est inscrit automatiquement.
create function private.activities_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_participants (activity_id, user_id, school_id, status)
  values (new.id, new.creator_id, new.school_id, 'registered');
  return new;
end;
$$;

create trigger activities_after_insert
  after insert on public.activities
  for each row execute function private.activities_after_insert();

-- Promeut les premiers de la liste d'attente tant qu'il reste des places (F-ACT-06).
create function private.promote_waitlist(p_activity_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_activity public.activities;
  v_registered int;
  v_next uuid;
begin
  select * into v_activity from public.activities where id = p_activity_id;
  loop
    select count(*) into v_registered from public.activity_participants
      where activity_id = p_activity_id and status = 'registered';
    exit when v_activity.max_participants is not null and v_registered >= v_activity.max_participants;

    select user_id into v_next from public.activity_participants
      where activity_id = p_activity_id and status = 'waitlisted'
      order by waitlist_position limit 1;
    exit when v_next is null;

    update public.activity_participants set status = 'registered', waitlist_position = null
      where activity_id = p_activity_id and user_id = v_next;
    insert into public.notifications (school_id, user_id, type, title, body, data)
    values (v_activity.school_id, v_next, 'waitlist_promoted', v_activity.title,
            'Une place s''est libérée, tu es inscrit !', jsonb_build_object('activity_id', p_activity_id));
  end loop;
end;
$$;

-- Prévient les inscrits (et la liste d'attente), sauf l'organisateur.
create function private.notify_participants(p_activity public.activities, p_type text, p_body text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (school_id, user_id, type, title, body, data)
  select p_activity.school_id, p.user_id, p_type, p_activity.title, p_body, jsonb_build_object('activity_id', p_activity.id)
  from public.activity_participants p
  where p.activity_id = p_activity.id and p.status in ('registered', 'waitlisted') and p.user_id <> p_activity.creator_id;
$$;

-- Règles de modification (F-ACT-09).
create function private.activities_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status <> 'published' or old.ends_at < now() then
    raise exception 'activity_locked';
  end if;
  new.title := trim(new.title);
  new.updated_at := now();
  if new.starts_at is distinct from old.starts_at
     and (new.starts_at < now() + interval '30 minutes' or new.starts_at > now() + interval '6 months') then
    raise exception 'start_out_of_range';
  end if;
  if new.is_official and not old.is_official and private.current_role() not in ('ambassador', 'school_admin') then
    raise exception 'official_not_allowed';
  end if;
  if new.max_participants is not null
     and new.max_participants < (select count(*) from public.activity_participants
                                 where activity_id = new.id and status = 'registered') then
    raise exception 'capacity_below_registered';
  end if;
  return new;
end;
$$;

create trigger activities_before_update
  before update on public.activities
  for each row execute function private.activities_before_update();

create function private.activities_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status = 'published' then
    perform private.notify_participants(new, 'activity_cancelled', 'Cette activité est annulée.');
    return new;
  end if;
  if new.starts_at is distinct from old.starts_at
     or new.lat is distinct from old.lat or new.lng is distinct from old.lng
     or new.location_name is distinct from old.location_name then
    perform private.notify_participants(new, 'activity_updated', 'La date ou le lieu a changé, jette un œil.');
  end if;
  if new.max_participants is distinct from old.max_participants then
    perform private.promote_waitlist(new.id);
  end if;
  return new;
end;
$$;

create trigger activities_after_update
  after update on public.activities
  for each row execute function private.activities_after_update();

-- RLS ET PRIVILÈGES ----------------------------------------------------------------

alter table public.activities enable row level security;
alter table public.activity_participants enable row level security;
revoke all on public.activities, public.activity_participants from anon, authenticated;

grant select on public.activities, public.activity_participants to authenticated;
-- Ni school_id, ni creator_id, ni status : fixés par le trigger ou par cancel_activity.
grant insert (title, description, category, is_official, starts_at, ends_at, location_name, address, lat, lng, max_participants, cover_url)
  on public.activities to authenticated;
grant update (title, description, category, is_official, starts_at, ends_at, location_name, address, lat, lng, max_participants, cover_url)
  on public.activities to authenticated;

-- Une activité masquée par la modération n'est visible que de son auteur et des modérateurs.
create policy activities_select_school on public.activities
  for select to authenticated
  using (
    school_id = private.current_school_id()
    and (status <> 'hidden' or creator_id = auth.uid()
         or private.current_role() in ('ambassador', 'school_admin', 'super_admin'))
  );

create policy activities_insert_own on public.activities
  for insert to authenticated
  with check (creator_id = auth.uid() and school_id = private.current_school_id());

create policy activities_update_own on public.activities
  for update to authenticated
  using (creator_id = auth.uid() and school_id = private.current_school_id())
  with check (creator_id = auth.uid() and school_id = private.current_school_id());

-- Inscriptions : lisibles dans l'école (F-ACT-08, liste des participants) ; écriture par fonctions uniquement.
create policy activity_participants_select_school on public.activity_participants
  for select to authenticated
  using (school_id = private.current_school_id());

-- INSCRIPTION / DÉSINSCRIPTION / ANNULATION -----------------------------------------

-- F-ACT-06. Renvoie 'registered' ou 'waitlisted'. Le verrou sur l'activité empêche la surréservation.
create function public.join_activity(p_activity_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_activity public.activities;
  v_registered int;
  v_status text;
  v_position int;
begin
  select * into v_activity from public.activities
    where id = p_activity_id and school_id = private.current_school_id()
    for update;
  if not found or v_activity.status <> 'published' then
    raise exception 'activity_not_found';
  end if;
  if v_activity.starts_at <= now() then
    raise exception 'activity_started';
  end if;

  select status into v_status from public.activity_participants where activity_id = p_activity_id and user_id = v_uid;
  if v_status in ('registered', 'waitlisted') then
    return v_status;
  end if;

  select count(*) into v_registered from public.activity_participants
    where activity_id = p_activity_id and status = 'registered';

  if v_activity.max_participants is null or v_registered < v_activity.max_participants then
    v_status := 'registered';
  else
    v_status := 'waitlisted';
    select coalesce(max(waitlist_position), 0) + 1 into v_position
      from public.activity_participants where activity_id = p_activity_id;
  end if;

  insert into public.activity_participants (activity_id, user_id, school_id, status, waitlist_position)
  values (p_activity_id, v_uid, v_activity.school_id, v_status, v_position)
  on conflict (activity_id, user_id)
    do update set status = excluded.status, waitlist_position = excluded.waitlist_position, created_at = now();

  return v_status;
end;
$$;

-- F-ACT-07 : possible jusqu'au début. L'organisateur ne se désinscrit pas, il annule.
create function public.leave_activity(p_activity_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_activity public.activities;
begin
  select * into v_activity from public.activities
    where id = p_activity_id and school_id = private.current_school_id()
    for update;
  if not found then
    raise exception 'activity_not_found';
  end if;
  if v_activity.creator_id = v_uid then
    raise exception 'organizer_cannot_leave';
  end if;
  if v_activity.starts_at <= now() then
    raise exception 'activity_started';
  end if;

  update public.activity_participants set status = 'cancelled', waitlist_position = null
    where activity_id = p_activity_id and user_id = v_uid and status in ('registered', 'waitlisted');

  if v_activity.status = 'published' then
    perform private.promote_waitlist(p_activity_id);
  end if;
end;
$$;

-- F-ACT-09 : annulation par l'organisateur, tous les inscrits sont prévenus (trigger).
create function public.cancel_activity(p_activity_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.activities set status = 'cancelled'
    where id = p_activity_id and creator_id = auth.uid() and school_id = private.current_school_id();
  if not found then
    raise exception 'activity_not_found';
  end if;
end;
$$;

revoke all on function public.join_activity(uuid) from public, anon;
revoke all on function public.leave_activity(uuid) from public, anon;
revoke all on function public.cancel_activity(uuid) from public, anon;
grant execute on function public.join_activity(uuid) to authenticated;
grant execute on function public.leave_activity(uuid) to authenticated;
grant execute on function public.cancel_activity(uuid) to authenticated;

-- SUPPRESSION DE COMPTE ET EXPORT : prise en compte des activités ---------------------

-- Avant d'anonymiser : les activités à venir que j'organise sont annulées (inscrits prévenus),
-- et mes inscriptions à venir libèrent leur place.
create function private.release_activities(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_activity_id uuid;
begin
  update public.activities set status = 'cancelled'
    where creator_id = p_user_id and status = 'published' and ends_at > now();

  for v_activity_id in
    update public.activity_participants p set status = 'cancelled', waitlist_position = null
      from public.activities a
      where a.id = p.activity_id and p.user_id = p_user_id
        and p.status in ('registered', 'waitlisted') and a.status = 'published' and a.starts_at > now()
      returning p.activity_id
  loop
    perform private.promote_waitlist(v_activity_id);
  end loop;
end;
$$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  perform private.release_activities(v_uid);

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
  delete from public.notifications where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'school', (select s.name from public.schools s join public.profiles p on p.school_id = s.id where p.id = auth.uid()),
    'push_devices', (select coalesce(jsonb_agg(jsonb_build_object('platform', t.platform, 'created_at', t.created_at)), '[]'::jsonb)
                     from public.push_tokens t where t.user_id = auth.uid()),
    'activities_created', (select coalesce(jsonb_agg(to_jsonb(a) order by a.starts_at), '[]'::jsonb)
                           from public.activities a where a.creator_id = auth.uid()),
    'participations', (select coalesce(jsonb_agg(jsonb_build_object(
                         'activity', a.title, 'starts_at', a.starts_at, 'status', p.status,
                         'registered_at', p.created_at, 'checked_in_at', p.checked_in_at) order by a.starts_at), '[]'::jsonb)
                       from public.activity_participants p join public.activities a on a.id = p.activity_id
                       where p.user_id = auth.uid()),
    'notifications', (select coalesce(jsonb_agg(jsonb_build_object('type', n.type, 'title', n.title, 'body', n.body, 'created_at', n.created_at)), '[]'::jsonb)
                      from public.notifications n where n.user_id = auth.uid())
  );
$$;

-- VUE POUR LE FIL ET LES FICHES ------------------------------------------------------
-- security_invoker : la RLS des tables s'applique à celui qui lit.

create view public.activity_cards with (security_invoker = true) as
  select
    a.id, a.school_id, a.creator_id, a.title, a.description, a.category, a.is_official, a.starts_at, a.ends_at,
    a.location_name, a.address, a.lat, a.lng, a.max_participants, a.cover_url, a.status, a.created_at,
    c.first_name as creator_first_name,
    c.last_name as creator_last_name,
    c.avatar_url as creator_avatar_url,
    counts.registered_count,
    -- null = places illimitées ; sert au filtre « Places disponibles » (F-DISC-02).
    a.max_participants - counts.registered_count as spots_left,
    (select p.status from public.activity_participants p
      where p.activity_id = a.id and p.user_id = auth.uid() and p.status <> 'cancelled') as my_status
  from public.activities a
  left join public.public_profiles c on c.id = a.creator_id
  cross join lateral (
    select count(*)::int as registered_count from public.activity_participants p
    where p.activity_id = a.id and p.status = 'registered'
  ) counts;

revoke all on public.activity_cards from anon, authenticated;
grant select on public.activity_cards to authenticated;

-- PHOTOS DE COUVERTURE ----------------------------------------------------------------
-- Bucket privé. Chemin : {id école}/{id utilisateur}/{fichier}.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', false, 5242880, '{image/jpeg,image/png,image/webp}')
on conflict (id) do nothing;

create policy covers_select_school on storage.objects
  for select to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = private.current_school_id()::text);

create policy covers_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = private.current_school_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy covers_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[2] = auth.uid()::text);
