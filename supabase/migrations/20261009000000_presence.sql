-- LOT 4 — Présence et engagement : check-in par QR (F-ACT-10, NF-SEC-03), points et badges (F-GAME-01 à 03),
-- rencontres et recommandations (F-MATCH). La boutique de goodies arrive avec le back-office (lot 6).
-- La présence validée est la seule donnée qui compte pour les points, « Mes rencontres » et le dashboard.

-- TABLES ---------------------------------------------------------------------------

-- Secret de signature des QR codes, par activité. Schéma privé : jamais exposé par l'API.
create table private.activity_secrets (
  activity_id uuid primary key references public.activities (id) on delete cascade,
  secret text not null
);

-- Une ligne par binôme qui s'est croisé (présences validées à la même activité). user_a < user_b.
create table public.encounters (
  school_id uuid not null references public.schools (id),
  user_a uuid not null references public.profiles (id),
  user_b uuid not null references public.profiles (id),
  shared_count int not null default 1,
  last_activity_id uuid references public.activities (id) on delete set null,
  last_met_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create index encounters_user_b_idx on public.encounters (user_b);

create table public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  user_id uuid not null references public.profiles (id),
  -- Peut valoir 0 quand le plafond quotidien est atteint : la ligne garde la trace et empêche un second crédit.
  amount int not null,
  reason text not null,
  -- Ce qui rend le crédit unique : l'activité, la catégorie, ou 'once'.
  ref_key text not null,
  ref_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, reason, ref_key)
);

create index point_transactions_user_idx on public.point_transactions (user_id, created_at desc);

create table public.badges (
  code text primary key,
  name text not null,
  description text not null,
  icon text not null,
  sort_order int not null
);

-- À garder synchronisé avec BADGES dans packages/shared.
insert into public.badges (code, name, description, icon, sort_order) values
  ('first_step', 'Premier pas', 'Ta 1re activité', '🌱', 1),
  ('explorer', 'Explorateur', '4 catégories différentes', '🧭', 2),
  ('athlete', 'Sportif', '5 activités Sport', '⚽', 3),
  ('organizer', 'Organisateur', '3 activités organisées réussies', '🎤', 4),
  ('mentor', 'Parrain', 'Ton premier filleul accepté', '🤝', 5),
  ('pillar', 'Pilier', '20 activités', '🏛', 6),
  ('regular', 'Régulier', 'Au moins 1 activité par semaine pendant 4 semaines', '🔥', 7);

create table public.user_badges (
  user_id uuid not null references public.profiles (id),
  badge_code text not null references public.badges (code),
  school_id uuid not null references public.schools (id),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_code)
);

alter table public.encounters enable row level security;
alter table public.point_transactions enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
revoke all on public.encounters, public.point_transactions, public.badges, public.user_badges from anon, authenticated;
grant select on public.encounters, public.point_transactions, public.badges, public.user_badges to authenticated;
-- Aucune écriture directe : tout passe par le check-in.

-- Mes rencontres et mes points ne regardent que moi (et jamais l'école, §10).
create policy encounters_select_own on public.encounters
  for select to authenticated using (auth.uid() in (user_a, user_b));
create policy point_transactions_select_own on public.point_transactions
  for select to authenticated using (user_id = auth.uid());
create policy badges_select_all on public.badges
  for select to authenticated using (true);
-- Les badges font partie du profil public (F-PROF-02) : visibles dans l'école.
create policy user_badges_select_school on public.user_badges
  for select to authenticated using (school_id = private.current_school_id());

-- Profil public : nombre d'activités réalisées (F-PROF-02).
create or replace view public.public_profiles
with (security_invoker = false, security_barrier = true) as
  select id, school_id, first_name, last_name, program, study_year, bio, avatar_url, interests, role, is_mentor,
    (select count(*)::int from public.activity_participants ap
      where ap.user_id = profiles.id and ap.checked_in_at is not null) as activities_done
  from public.profiles
  where status = 'active'
    and school_id = private.current_school_id()
    and not private.is_blocked_with(id);

-- POINTS -----------------------------------------------------------------------------

-- Crédite des points une seule fois par (utilisateur, raison, clé), dans la limite du plafond quotidien.
-- Le montant vient du barème de l'école (schools.settings.points) ou, à défaut, de la valeur passée.
create function private.add_points(p_user uuid, p_school uuid, p_reason text, p_ref_key text, p_ref_id uuid, p_default int)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_settings jsonb;
  v_amount int;
  v_today int;
begin
  select coalesce(settings -> 'points', '{}'::jsonb) into v_settings from public.schools where id = p_school;
  v_amount := coalesce((v_settings ->> p_reason)::int, p_default);

  select coalesce(sum(amount), 0) into v_today from public.point_transactions
    where user_id = p_user and amount > 0 and created_at >= date_trunc('day', now());
  v_amount := greatest(least(v_amount, coalesce((v_settings ->> 'daily_cap')::int, 60) - v_today), 0);

  insert into public.point_transactions (school_id, user_id, amount, reason, ref_key, ref_id)
  values (p_school, p_user, v_amount, p_reason, p_ref_key, p_ref_id)
  on conflict (user_id, reason, ref_key) do nothing;
  if not found then
    return 0;
  end if;

  update public.profiles set points_balance = points_balance + v_amount where id = p_user;
  return v_amount;
end;
$$;

-- Attribue les badges mérités et pas encore obtenus (§6.9). Renvoie les codes nouvellement gagnés.
create function private.evaluate_badges(p_user uuid, p_school uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_total int;
  v_categories int;
  v_sport int;
  v_weeks int;
  v_organized int;
  v_new text[];
begin
  select count(*), count(distinct a.category), count(*) filter (where a.category = 'sport'),
         count(distinct date_trunc('week', a.starts_at))
           filter (where a.starts_at >= date_trunc('week', now()) - interval '3 weeks')
    into v_total, v_categories, v_sport, v_weeks
    from public.activity_participants p join public.activities a on a.id = p.activity_id
    where p.user_id = p_user and p.checked_in_at is not null;
  select count(*) into v_organized from public.point_transactions
    where user_id = p_user and reason = 'organizer_success';

  with earned as (
    insert into public.user_badges (user_id, badge_code, school_id)
    select p_user, code, p_school
    from unnest(array[
      case when v_total >= 1 then 'first_step' end,
      case when v_categories >= 4 then 'explorer' end,
      case when v_sport >= 5 then 'athlete' end,
      case when v_organized >= 3 then 'organizer' end,
      case when v_total >= 20 then 'pillar' end,
      case when v_weeks >= 4 then 'regular' end
    ]) as code
    where code is not null
    on conflict (user_id, badge_code) do nothing
    returning badge_code
  )
  select coalesce(array_agg(badge_code), '{}') into v_new from earned;

  insert into public.notifications (school_id, user_id, type, title, body)
  select p_school, p_user, 'badge_unlocked', 'Nouveau badge ' || b.icon, 'Tu as débloqué « ' || b.name || ' ». Bravo !'
  from public.badges b where b.code = any (v_new);

  return v_new;
end;
$$;

-- CHECK-IN ----------------------------------------------------------------------------

-- F-ACT-10 : de 30 min avant le début à 2 h après la fin.
create function private.checkin_open(p_activity public.activities) returns boolean
language sql stable as $$
  select p_activity.status = 'published'
     and now() between p_activity.starts_at - interval '30 minutes' and p_activity.ends_at + interval '2 hours';
$$;

-- Signature d'un jeton pour une fenêtre d'une minute.
create function private.checkin_signature(p_activity_id uuid, p_window bigint) returns text
language sql stable security definer set search_path = '' as $$
  select encode(sha256(convert_to(s.secret || ':' || p_activity_id::text || ':' || p_window::text, 'UTF8')), 'hex')
  from private.activity_secrets s where s.activity_id = p_activity_id;
$$;

-- Valide une présence et en tire toutes les conséquences : points, rencontres, badges.
create function private.record_presence(p_activity public.activities, p_user uuid, p_method text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_points int := 0;
  v_others int;
begin
  update public.activity_participants set checked_in_at = now(), checkin_method = p_method
    where activity_id = p_activity.id and user_id = p_user and status = 'registered' and checked_in_at is null;
  if not found then
    return jsonb_build_object('status', 'already', 'points', 0, 'badges', '[]'::jsonb);
  end if;

  v_points := v_points + private.add_points(p_user, p_activity.school_id, 'attendance', p_activity.id::text, p_activity.id, 10);
  v_points := v_points + private.add_points(p_user, p_activity.school_id, 'first_activity_bonus', 'once', p_activity.id, 15);
  v_points := v_points + private.add_points(p_user, p_activity.school_id, 'new_category', p_activity.category, p_activity.id, 5);

  -- Rencontres : avec tous ceux dont la présence est déjà validée.
  insert into public.encounters (school_id, user_a, user_b, last_activity_id, last_met_at)
  select p_activity.school_id, least(p_user, o.user_id), greatest(p_user, o.user_id), p_activity.id, now()
  from public.activity_participants o
  where o.activity_id = p_activity.id and o.checked_in_at is not null and o.user_id <> p_user
  on conflict (user_a, user_b) do update
    set shared_count = public.encounters.shared_count + 1,
        last_activity_id = excluded.last_activity_id,
        last_met_at = excluded.last_met_at;

  if p_user <> p_activity.creator_id then
    -- L'organisateur ne scanne pas son propre QR : sa présence est validée avec celle du premier participant.
    -- (Seul, il ne gagne donc rien : pas de points en créant des activités fantômes.)
    perform private.record_presence(p_activity, p_activity.creator_id, 'manual');

    select count(*) into v_others from public.activity_participants
      where activity_id = p_activity.id and checked_in_at is not null and user_id <> p_activity.creator_id;
    if v_others >= 3 then
      perform private.add_points(p_activity.creator_id, p_activity.school_id, 'organizer_success', p_activity.id::text, p_activity.id, 20);
      perform private.evaluate_badges(p_activity.creator_id, p_activity.school_id);
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'points', v_points,
    'badges', to_jsonb(private.evaluate_badges(p_user, p_activity.school_id))
  );
end;
$$;

-- Qui peut valider les présences : l'organisateur, ou un ambassadeur de l'école (§4.3).
create function private.can_validate(p_activity public.activities) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_activity.school_id = private.current_school_id()
     and (p_activity.creator_id = auth.uid() or private.current_role() = 'ambassador');
$$;

-- Jeton affiché en QR par l'organisateur. Il change chaque minute (NF-SEC-03) : une capture d'écran
-- partagée cesse de marcher au bout de 2 minutes au plus.
create function public.get_checkin_token(p_activity_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_activity public.activities;
  v_window bigint := floor(extract(epoch from now()) / 60);
begin
  select * into v_activity from public.activities where id = p_activity_id;
  if not found or not private.can_validate(v_activity) then
    raise exception 'activity_not_found';
  end if;
  if not private.checkin_open(v_activity) then
    raise exception 'checkin_closed';
  end if;

  insert into private.activity_secrets (activity_id, secret)
  values (p_activity_id, gen_random_uuid()::text || gen_random_uuid()::text)
  on conflict (activity_id) do nothing;

  return jsonb_build_object(
    'token', p_activity_id::text || '.' || v_window::text || '.' || private.checkin_signature(p_activity_id, v_window),
    'expires_in', 60 - (extract(epoch from now())::bigint % 60)
  );
end;
$$;

-- Scan du QR par un participant inscrit.
create function public.checkin(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_parts text[] := string_to_array(coalesce(p_token, ''), '.');
  v_activity public.activities;
  v_window bigint;
  v_now bigint := floor(extract(epoch from now()) / 60);
begin
  if array_length(v_parts, 1) <> 3 or v_parts[2] !~ '^\d{1,12}$'
     or v_parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'checkin_invalid';
  end if;
  v_window := v_parts[2]::bigint;

  select * into v_activity from public.activities
    where id = v_parts[1]::uuid and school_id = private.current_school_id();
  if not found or v_parts[3] is distinct from private.checkin_signature(v_activity.id, v_window) then
    raise exception 'checkin_invalid';
  end if;
  -- Jeton de la minute en cours ou de la précédente.
  if v_window not in (v_now, v_now - 1) then
    raise exception 'checkin_expired';
  end if;
  if not private.checkin_open(v_activity) then
    raise exception 'checkin_closed';
  end if;
  if not exists (select 1 from public.activity_participants
                 where activity_id = v_activity.id and user_id = auth.uid() and status = 'registered') then
    raise exception 'checkin_not_registered';
  end if;

  return private.record_presence(v_activity, auth.uid(), 'qr');
end;
$$;

-- Alternative : l'organisateur (ou un ambassadeur) coche un inscrit présent.
create function public.manual_checkin(p_activity_id uuid, p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_activity public.activities;
begin
  select * into v_activity from public.activities where id = p_activity_id;
  if not found or not private.can_validate(v_activity) then
    raise exception 'activity_not_found';
  end if;
  if not private.checkin_open(v_activity) then
    raise exception 'checkin_closed';
  end if;
  if p_user_id = auth.uid()
     or not exists (select 1 from public.activity_participants
                    where activity_id = p_activity_id and user_id = p_user_id and status = 'registered') then
    raise exception 'checkin_not_registered';
  end if;
  return private.record_presence(v_activity, p_user_id, 'manual');
end;
$$;

revoke all on function public.get_checkin_token(uuid) from public, anon;
revoke all on function public.checkin(text) from public, anon;
revoke all on function public.manual_checkin(uuid, uuid) from public, anon;
grant execute on function public.get_checkin_token(uuid) to authenticated;
grant execute on function public.checkin(text) to authenticated;
grant execute on function public.manual_checkin(uuid, uuid) to authenticated;

-- RENCONTRES ET RECOMMANDATIONS (F-MATCH) ------------------------------------------------

-- « Mes rencontres » : les personnes bloquées n'y figurent pas, public_profiles les exclut déjà (F-MATCH-05).
create view public.my_encounters with (security_invoker = true) as
  select
    o.id as user_id, o.first_name, o.last_name, o.avatar_url, o.program,
    e.shared_count, e.last_met_at, a.title as last_activity_title
  from public.encounters e
  join public.public_profiles o on o.id = case when e.user_a = auth.uid() then e.user_b else e.user_a end
  left join public.activities a on a.id = e.last_activity_id
  where auth.uid() in (e.user_a, e.user_b);

revoke all on public.my_encounters from anon, authenticated;
grant select on public.my_encounters to authenticated;

-- F-MATCH-03 « Pour toi » : +3 si une de mes rencontres est inscrite, +2 si la catégorie fait partie de mes
-- centres d'intérêt ou de mon historique, +1 si c'est dans les 7 jours, +1 si officielle. Les 5 meilleures.
create function public.recommended_activities() returns setof public.activity_cards
language sql stable set search_path = '' as $$
  select c.*
  from public.activity_cards c
  cross join lateral (
    select
      case when exists (
        select 1 from public.activity_participants p join public.my_encounters e on e.user_id = p.user_id
        where p.activity_id = c.id and p.status = 'registered') then 3 else 0 end
      + case when c.category = any (coalesce((select interests from public.profiles where id = auth.uid()), '{}'))
               or exists (select 1 from public.activity_participants p join public.activities a on a.id = p.activity_id
                          where p.user_id = auth.uid() and p.checked_in_at is not null and a.category = c.category)
             then 2 else 0 end
      + case when c.starts_at < now() + interval '7 days' then 1 else 0 end
      + case when c.is_official then 1 else 0 end as score
  ) s
  where c.status = 'published' and c.starts_at > now() and c.my_status is null
    and (c.spots_left is null or c.spots_left > 0)
    and s.score >= 2
  order by s.score desc, c.starts_at
  limit 5;
$$;

revoke all on function public.recommended_activities() from public, anon;
grant execute on function public.recommended_activities() to authenticated;

-- SUPPRESSION DE COMPTE ET EXPORT : prise en compte du lot 4 --------------------------------

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  perform private.release_activities(v_uid);
  -- Mes messages restent, affichés comme « Utilisateur supprimé » (F-AUTH-08).
  update public.conversation_members set left_at = now() where user_id = v_uid and left_at is null;
  delete from public.blocks where blocker_id = v_uid or blocked_id = v_uid;
  delete from public.encounters where v_uid in (user_a, user_b);
  delete from public.point_transactions where user_id = v_uid;
  delete from public.user_badges where user_id = v_uid;

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
                      from public.notifications n where n.user_id = auth.uid()),
    'messages_sent', (select coalesce(jsonb_agg(jsonb_build_object('content', m.content, 'sent_at', m.created_at) order by m.created_at), '[]'::jsonb)
                      from public.messages m where m.sender_id = auth.uid()),
    'blocked_users', (select count(*) from public.blocks b where b.blocker_id = auth.uid()),
    'reports_made', (select coalesce(jsonb_agg(jsonb_build_object('target_type', r.target_type, 'reason', r.reason, 'comment', r.comment,
                       'status', r.status, 'created_at', r.created_at)), '[]'::jsonb)
                     from public.reports r where r.reporter_id = auth.uid()),
    'points', (select coalesce(jsonb_agg(jsonb_build_object('amount', t.amount, 'reason', t.reason, 'created_at', t.created_at) order by t.created_at), '[]'::jsonb)
               from public.point_transactions t where t.user_id = auth.uid()),
    'badges', (select coalesce(jsonb_agg(jsonb_build_object('badge', b.badge_code, 'earned_at', b.earned_at)), '[]'::jsonb)
               from public.user_badges b where b.user_id = auth.uid()),
    'encounters', (select coalesce(jsonb_agg(jsonb_build_object('shared_activities', e.shared_count, 'last_met_at', e.last_met_at)), '[]'::jsonb)
                   from public.encounters e where auth.uid() in (e.user_a, e.user_b))
  );
$$;

-- DURCISSEMENT ---------------------------------------------------------------------------
-- Le schéma private n'est pas exposé par l'API, mais ses fonctions étaient exécutables par défaut.
-- On ne laisse que celles dont les policies, vues et contraintes ont besoin côté utilisateur.

alter table private.activity_secrets enable row level security;

revoke execute on all functions in schema private from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;

grant execute on function private.current_school_id() to authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.is_blocked_with(uuid) to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.conversation_writable(uuid) to authenticated;
grant execute on function private.category_codes() to authenticated;