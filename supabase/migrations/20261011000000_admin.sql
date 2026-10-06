-- LOT 6 — Back-office : comptes admin (F-ADM-01, F-SUP-02), gestion de l'école (F-ADM-02 à 05), goodies
-- (F-GAME-04/05, F-ADM-06), annonces (F-ADM-07), dashboard anonymisé (F-DASH), écoles (F-SUP).
-- Aucune clé de service : tout passe par des fonctions qui vérifient le rôle de l'appelant.

-- COMPTES ADMIN -------------------------------------------------------------------------

-- Un admin école n'a pas de date de naissance ; le super-admin n'appartient à aucune école.
alter table public.profiles alter column school_id drop not null;
alter table public.profiles alter column birth_date drop not null;
alter table public.profiles add constraint profiles_shape_by_role check (
  (role = 'super_admin' or school_id is not null)
  and (role in ('school_admin', 'super_admin') or birth_date is not null)
);

-- Le personnel n'apparaît pas parmi les étudiants (participants, profils, parrains).
create or replace view public.public_profiles
with (security_invoker = false, security_barrier = true) as
  select id, school_id, first_name, last_name, program, study_year, bio, avatar_url, interests, role, is_mentor,
    (select count(*)::int from public.activity_participants ap
      where ap.user_id = profiles.id and ap.checked_in_at is not null) as activities_done
  from public.profiles
  where status = 'active'
    and role in ('student', 'ambassador')
    and school_id = private.current_school_id()
    and not private.is_blocked_with(id);

-- F-SUP-04 : une école est active tant qu'elle n'est pas désactivée et que son abonnement court.
create function private.school_is_active(p_school public.schools) returns boolean
language sql stable as $$
  select p_school.is_active and (p_school.subscription_ends_at is null or p_school.subscription_ends_at >= current_date);
$$;

-- Les étudiants d'une école inactive ne lisent plus rien ; les inscriptions y sont fermées.
create or replace function private.current_school_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.school_id from public.profiles p join public.schools s on s.id = p.school_id
  where p.id = auth.uid() and p.status = 'active' and private.school_is_active(s);
$$;

create or replace function private.current_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p left join public.schools s on s.id = p.school_id
  where p.id = auth.uid() and p.status = 'active' and (p.school_id is null or private.school_is_active(s));
$$;

create or replace function public.check_school_domain(p_email text)
returns table (school_id uuid, school_name text, programs jsonb)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, coalesce(s.settings -> 'programs', '[]'::jsonb)
  from public.schools s
  where private.school_is_active(s)
    and position('@' in p_email) > 1
    and lower(split_part(trim(p_email), '@', 2)) = any (s.email_domains)
  limit 1;
$$;

-- Invitations : le super-admin (ou un admin école pour sa propre école) inscrit l'email d'un futur admin.
-- La personne crée ensuite son compte elle-même, par code reçu par email, depuis le back-office.
create table public.admin_invites (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('school_admin', 'super_admin')),
  school_id uuid references public.schools (id) on delete cascade,
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check ((role = 'super_admin') = (school_id is null))
);

alter table public.admin_invites enable row level security;
revoke all on public.admin_invites from anon, authenticated;

-- Le hook de création de compte laisse aussi passer les emails invités comme admin.
create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_email text := lower(event -> 'user' ->> 'email');
begin
  if exists (select 1 from public.check_school_domain(v_email))
     or exists (select 1 from public.admin_invites where email = v_email and accepted_at is null) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'school_not_found'));
end;
$$;

-- Dit au back-office, avant l'envoi du code, si cet email a le droit de s'y connecter.
create function public.check_admin_email(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_invites where email = lower(trim(p_email)) and accepted_at is null)
      or exists (select 1 from public.profiles where email = lower(trim(p_email))
                 and role in ('school_admin', 'super_admin') and status = 'active');
$$;

-- Première connexion d'un admin invité : crée son profil avec le rôle prévu par l'invitation.
create function public.accept_admin_invite(p_first_name text, p_last_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invite public.admin_invites;
begin
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then
    raise exception 'email_not_verified';
  end if;
  select * into v_invite from public.admin_invites where email = v_email and accepted_at is null for update;
  if not found then
    raise exception 'invite_not_found';
  end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_exists';
  end if;
  if char_length(trim(coalesce(p_first_name, ''))) not between 1 and 50
     or char_length(trim(coalesce(p_last_name, ''))) not between 1 and 50 then
    raise exception 'name_invalid';
  end if;

  insert into public.profiles (id, school_id, first_name, last_name, email, role, cgu_accepted_at)
  values (v_uid, v_invite.school_id, trim(p_first_name), trim(p_last_name), v_email, v_invite.role, now());
  update public.admin_invites set accepted_at = now() where email = v_email;
  return v_invite.role;
end;
$$;

-- GARDE-FOUS ----------------------------------------------------------------------------

create function private.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active' and role = 'super_admin');
$$;

-- L'école que l'appelant a le droit d'administrer : la sienne pour un admin école (p_school_id facultatif),
-- celle qu'il désigne pour le super-admin. Lève 'not_admin' sinon.
create function private.admin_scope(p_school_id uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text;
  v_school uuid;
begin
  select role, school_id into v_role, v_school from public.profiles where id = auth.uid() and status = 'active';
  if v_role = 'super_admin' then
    if p_school_id is null or not exists (select 1 from public.schools where id = p_school_id) then
      raise exception 'school_required';
    end if;
    return p_school_id;
  elsif v_role = 'school_admin' and (p_school_id is null or p_school_id = v_school) then
    return v_school;
  end if;
  raise exception 'not_admin';
end;
$$;

-- Qui suis-je dans le back-office, et quelles écoles puis-je ouvrir.
create function public.admin_context() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'role', p.role,
    'first_name', p.first_name,
    'school_id', p.school_id,
    'schools', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'is_active', private.school_is_active(s)) order by s.name), '[]'::jsonb)
      from public.schools s where p.role = 'super_admin' or s.id = p.school_id
    )
  )
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active' and p.role in ('school_admin', 'super_admin');
$$;

-- ÉCOLE (F-ADM-02, F-SUP-01) ---------------------------------------------------------------

create function public.admin_get_school(p_school_id uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(s) from public.schools s where s.id = private.admin_scope(p_school_id);
$$;

-- L'admin école modifie la présentation et les réglages ; les domaines, l'état et l'abonnement sont
-- réservés au super-admin (clés ignorées sinon).
create function public.admin_update_school(p_school_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.admin_scope(p_school_id);
  v_super boolean := private.is_super_admin();
begin
  update public.schools s set
    name = coalesce(nullif(trim(p_patch ->> 'name'), ''), s.name),
    logo_url = case when p_patch ? 'logo_url' then nullif(trim(p_patch ->> 'logo_url'), '') else s.logo_url end,
    campus_address = case when p_patch ? 'campus_address' then nullif(trim(p_patch ->> 'campus_address'), '') else s.campus_address end,
    campus_lat = case when p_patch ? 'campus_lat' then (p_patch ->> 'campus_lat')::double precision else s.campus_lat end,
    campus_lng = case when p_patch ? 'campus_lng' then (p_patch ->> 'campus_lng')::double precision else s.campus_lng end,
    declared_student_count = case when p_patch ? 'declared_student_count' then (p_patch ->> 'declared_student_count')::int else s.declared_student_count end,
    settings = case when p_patch ? 'settings' then s.settings || (p_patch -> 'settings') else s.settings end,
    email_domains = case when v_super and p_patch ? 'email_domains'
      then array(select jsonb_array_elements_text(p_patch -> 'email_domains')) else s.email_domains end,
    is_active = case when v_super and p_patch ? 'is_active' then (p_patch ->> 'is_active')::boolean else s.is_active end,
    subscription_ends_at = case when v_super and p_patch ? 'subscription_ends_at'
      then (p_patch ->> 'subscription_ends_at')::date else s.subscription_ends_at end
  where s.id = v_school;
end;
$$;

-- F-SUP-01 : création d'une école.
create function public.admin_create_school(p_name text, p_slug text, p_email_domains text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not private.is_super_admin() then
    raise exception 'not_admin';
  end if;
  insert into public.schools (name, slug, email_domains) values (trim(p_name), lower(trim(p_slug)), p_email_domains)
    returning id into v_id;
  return v_id;
end;
$$;

-- F-SUP-02 : inviter un admin. Un admin école peut inviter un collègue pour sa propre école.
create function public.admin_invite(p_email text, p_role text, p_school_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_school uuid;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalid';
  end if;
  if p_role = 'super_admin' then
    if not private.is_super_admin() then
      raise exception 'not_admin';
    end if;
  elsif p_role = 'school_admin' then
    v_school := private.admin_scope(p_school_id);
  else
    raise exception 'role_invalid';
  end if;
  if exists (select 1 from public.profiles where email = v_email) then
    raise exception 'email_already_used';
  end if;
  insert into public.admin_invites (email, role, school_id, invited_by) values (v_email, p_role, v_school, auth.uid())
    on conflict (email) do update set role = excluded.role, school_id = excluded.school_id, invited_by = excluded.invited_by,
                                      created_at = now(), accepted_at = null;
end;
$$;

-- Admins et invitations en attente d'une école (ou super-admins si p_school_id est null, pour le super-admin).
create function public.admin_list_admins(p_school_id uuid default null)
returns table (email text, name text, role text, pending boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_school uuid;
begin
  if p_school_id is null and private.is_super_admin() then
    v_school := null;
  else
    v_school := private.admin_scope(p_school_id);
  end if;
  return query
    select p.email, (p.first_name || ' ' || p.last_name)::text, p.role, false
      from public.profiles p
      where p.status = 'active' and p.role in ('school_admin', 'super_admin') and p.school_id is not distinct from v_school
    union all
    select i.email, null::text, i.role, true
      from public.admin_invites i
      where i.accepted_at is null and i.school_id is not distinct from v_school
    order by 4, 1;
end;
$$;

-- F-SUP-03 : vue globale.
create function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_super_admin() then
    raise exception 'not_admin';
  end if;
  return jsonb_build_object(
    'schools', (select count(*) from public.schools),
    'active_schools', (select count(*) from public.schools s where private.school_is_active(s)),
    'students', (select count(*) from public.profiles where status = 'active' and role in ('student', 'ambassador')),
    'activities', (select count(*) from public.activities where status = 'published'),
    'presences', (select count(*) from public.activity_participants where checked_in_at is not null)
  );
end;
$$;

-- ÉTUDIANTS : ambassadeurs (F-ADM-03) et suspension (F-MOD-04) ----------------------------------
-- L'admin voit qui est inscrit (nom, email, rôle) pour gérer les comptes, jamais ce que chacun fait.

create function public.admin_search_students(p_school_id uuid, p_query text)
returns table (id uuid, first_name text, last_name text, email text, program text, study_year smallint, role text, status text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.first_name, p.last_name, p.email, p.program, p.study_year, p.role, p.status
  from public.profiles p
  where p.school_id = private.admin_scope(p_school_id)
    and p.role in ('student', 'ambassador')
    and p.status in ('active', 'suspended')
    and (coalesce(trim(p_query), '') = ''
         or (p.first_name || ' ' || p.last_name || ' ' || coalesce(p.email, '')) ilike '%' || trim(p_query) || '%')
  order by (p.role = 'ambassador') desc, (p.status = 'suspended') desc, p.last_name, p.first_name
  limit 50;
$$;

create function public.admin_set_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.admin_scope((select school_id from public.profiles where id = p_user_id));
begin
  if p_role not in ('student', 'ambassador') then
    raise exception 'role_invalid';
  end if;
  update public.profiles set role = p_role
    where id = p_user_id and school_id = v_school and role in ('student', 'ambassador') and status <> 'deleted';
  if not found then
    raise exception 'user_unavailable';
  end if;
end;
$$;

-- Suspendre coupe l'accès tout de suite (le compte ne lit plus rien) ; réactiver le rend.
create function public.admin_set_status(p_user_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.admin_scope((select school_id from public.profiles where id = p_user_id));
begin
  if p_status not in ('active', 'suspended') then
    raise exception 'status_invalid';
  end if;
  update public.profiles set status = p_status
    where id = p_user_id and school_id = v_school and role in ('student', 'ambassador') and status in ('active', 'suspended');
  if not found then
    raise exception 'user_unavailable';
  end if;
  if p_status = 'suspended' then
    perform private.release_activities(p_user_id);
  end if;
end;
$$;

-- RESSOURCES « BESOIN DE PARLER » (F-ADM-04) ---------------------------------------------------

create function public.admin_list_resources(p_school_id uuid default null) returns setof public.support_resources
language sql stable security definer set search_path = '' as $$
  select * from public.support_resources where school_id = private.admin_scope(p_school_id) order by sort_order, created_at;
$$;

create function public.admin_save_resource(
  p_school_id uuid, p_id uuid, p_name text, p_description text, p_phone text, p_url text, p_hours text, p_sort_order int
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.admin_scope(p_school_id);
  v_id uuid;
begin
  if char_length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'name_invalid';
  end if;
  if p_id is null then
    insert into public.support_resources (school_id, name, description, phone, url, hours, sort_order)
    values (v_school, trim(p_name), nullif(trim(p_description), ''), nullif(trim(p_phone), ''), nullif(trim(p_url), ''),
            nullif(trim(p_hours), ''), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update public.support_resources set
      name = trim(p_name), description = nullif(trim(p_description), ''), phone = nullif(trim(p_phone), ''),
      url = nullif(trim(p_url), ''), hours = nullif(trim(p_hours), ''), sort_order = coalesce(p_sort_order, 0)
    where id = p_id and school_id = v_school
    returning id into v_id;
    if v_id is null then
      raise exception 'resource_not_found';
    end if;
  end if;
  return v_id;
end;
$$;

create function public.admin_delete_resource(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.support_resources
    where id = p_id and school_id = private.admin_scope((select school_id from public.support_resources where id = p_id));
end;
$$;

-- GOODIES (F-GAME-04/05, F-ADM-06) --------------------------------------------------------------

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text,
  image_url text,
  cost_points int not null check (cost_points > 0),
  stock int not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  reward_id uuid not null references public.rewards (id),
  user_id uuid not null references public.profiles (id),
  cost_points int not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'cancelled')),
  pickup_code varchar(6) not null,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create index reward_redemptions_user_idx on public.reward_redemptions (user_id, created_at desc);

alter table public.rewards enable row level security;
alter table public.reward_redemptions enable row level security;
revoke all on public.rewards, public.reward_redemptions from anon, authenticated;
grant select on public.rewards, public.reward_redemptions to authenticated;

create policy rewards_select_school on public.rewards
  for select to authenticated using (school_id = private.current_school_id() and is_active);
create policy reward_redemptions_select_own on public.reward_redemptions
  for select to authenticated using (user_id = auth.uid());

-- L'étudiant échange ses points : débit immédiat (F-GAME-05), stock décrémenté, code de retrait.
create function public.redeem_reward(p_reward_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_reward public.rewards;
  v_balance int;
  v_id uuid;
  v_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
begin
  select * into v_reward from public.rewards
    where id = p_reward_id and school_id = private.current_school_id() and is_active for update;
  if not found then
    raise exception 'reward_not_found';
  end if;
  if v_reward.stock <= 0 then
    raise exception 'reward_out_of_stock';
  end if;
  select points_balance into v_balance from public.profiles where id = v_uid for update;
  if v_balance < v_reward.cost_points then
    raise exception 'not_enough_points';
  end if;

  insert into public.reward_redemptions (school_id, reward_id, user_id, cost_points, pickup_code)
  values (v_reward.school_id, v_reward.id, v_uid, v_reward.cost_points, v_code) returning id into v_id;
  update public.rewards set stock = stock - 1 where id = v_reward.id;
  update public.profiles set points_balance = points_balance - v_reward.cost_points where id = v_uid;
  insert into public.point_transactions (school_id, user_id, amount, reason, ref_key, ref_id)
  values (v_reward.school_id, v_uid, -v_reward.cost_points, 'reward', v_id::text, v_id);

  return jsonb_build_object('id', v_id, 'pickup_code', v_code, 'reward', v_reward.name);
end;
$$;

create function public.admin_list_rewards(p_school_id uuid default null) returns setof public.rewards
language sql stable security definer set search_path = '' as $$
  select * from public.rewards where school_id = private.admin_scope(p_school_id) order by is_active desc, cost_points;
$$;

create function public.admin_save_reward(
  p_school_id uuid, p_id uuid, p_name text, p_description text, p_image_url text, p_cost_points int, p_stock int, p_is_active boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.admin_scope(p_school_id);
  v_id uuid;
begin
  if p_id is null then
    insert into public.rewards (school_id, name, description, image_url, cost_points, stock, is_active)
    values (v_school, trim(p_name), nullif(trim(p_description), ''), nullif(trim(p_image_url), ''), p_cost_points,
            coalesce(p_stock, 0), coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.rewards set
      name = trim(p_name), description = nullif(trim(p_description), ''), image_url = nullif(trim(p_image_url), ''),
      cost_points = p_cost_points, stock = coalesce(p_stock, 0), is_active = coalesce(p_is_active, true)
    where id = p_id and school_id = v_school
    returning id into v_id;
    if v_id is null then
      raise exception 'reward_not_found';
    end if;
  end if;
  return v_id;
end;
$$;

-- Demandes de retrait. Ici l'admin voit le nom : il faut bien savoir à qui remettre le goodie.
create function public.admin_list_redemptions(p_school_id uuid default null)
returns table (id uuid, reward text, student text, pickup_code varchar, status text, cost_points int, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, w.name, (p.first_name || ' ' || p.last_name)::text, r.pickup_code, r.status, r.cost_points, r.created_at
  from public.reward_redemptions r
  join public.rewards w on w.id = r.reward_id
  join public.profiles p on p.id = r.user_id
  where r.school_id = private.admin_scope(p_school_id)
  order by (r.status = 'pending') desc, r.created_at desc
  limit 200;
$$;

-- « Remis », ou annulation : les points sont rendus et l'article remis en stock (F-GAME-05).
create function public.admin_set_redemption(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_redemption public.reward_redemptions;
begin
  select * into v_redemption from public.reward_redemptions where id = p_id and status = 'pending' for update;
  if not found then
    raise exception 'redemption_not_found';
  end if;
  perform private.admin_scope(v_redemption.school_id);
  if p_status not in ('delivered', 'cancelled') then
    raise exception 'status_invalid';
  end if;

  update public.reward_redemptions set status = p_status, handled_at = now() where id = p_id;
  if p_status = 'cancelled' then
    update public.rewards set stock = stock + 1 where id = v_redemption.reward_id;
    update public.profiles set points_balance = points_balance + v_redemption.cost_points where id = v_redemption.user_id;
    insert into public.point_transactions (school_id, user_id, amount, reason, ref_key, ref_id)
    values (v_redemption.school_id, v_redemption.user_id, v_redemption.cost_points, 'reward_refund', p_id::text, p_id);
  end if;
  insert into public.notifications (school_id, user_id, type, title, body)
  values (v_redemption.school_id, v_redemption.user_id, 'reward_update',
          case when p_status = 'delivered' then 'Goodie remis 🎁' else 'Retrait annulé' end,
          case when p_status = 'delivered' then 'Profites-en bien !' else 'Tes points t''ont été rendus.' end);
end;
$$;

-- Le plafond quotidien ne compte que les points gagnés : un remboursement de goodie n'empêche pas d'en gagner.
create or replace function private.add_points(p_user uuid, p_school uuid, p_reason text, p_ref_key text, p_ref_id uuid, p_default int)
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
    where user_id = p_user and amount > 0 and reason <> 'reward_refund' and created_at >= date_trunc('day', now());
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

-- F-ADM-08 : une activité officielle créée par l'école depuis le back-office n'inscrit pas l'admin comme
-- participant (il n'est pas étudiant). Les ambassadeurs valident les présences sur place.
create or replace function private.activities_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.conversations (school_id, type, activity_id) values (new.school_id, 'activity', new.id);
  if exists (select 1 from public.profiles where id = new.creator_id and role in ('student', 'ambassador')) then
    insert into public.activity_participants (activity_id, user_id, school_id, status)
    values (new.id, new.creator_id, new.school_id, 'registered');
  end if;
  return new;
end;
$$;

-- ANNONCES (F-ADM-07) ---------------------------------------------------------------------------

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  author_id uuid references public.profiles (id),
  title varchar(50) not null,
  body varchar(180) not null,
  activity_id uuid references public.activities (id) on delete set null,
  target jsonb not null default '{}'::jsonb,
  recipients_count int not null default 0,
  sent_at timestamptz not null default now()
);

alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;

-- Envoie une annonce à toute l'école ou à une formation / une année. 3 par semaine au plus (anti-spam).
-- Elle arrive dans les notifications de l'app ; l'envoi push la reprendra telle quelle.
create function public.admin_send_announcement(
  p_school_id uuid, p_title text, p_body text, p_activity_id uuid default null, p_program text default null, p_study_year int default null
) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.admin_scope(p_school_id);
  v_count int;
begin
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 50 or char_length(trim(coalesce(p_body, ''))) not between 1 and 180 then
    raise exception 'announcement_invalid';
  end if;
  if (select count(*) from public.announcements where school_id = v_school and sent_at > now() - interval '7 days') >= 3 then
    raise exception 'announcement_quota';
  end if;
  if p_activity_id is not null and not exists (select 1 from public.activities where id = p_activity_id and school_id = v_school) then
    raise exception 'activity_not_found';
  end if;

  with sent as (
    insert into public.notifications (school_id, user_id, type, title, body, data)
    select v_school, p.id, 'announcement', trim(p_title), trim(p_body),
           case when p_activity_id is null then '{}'::jsonb else jsonb_build_object('activity_id', p_activity_id) end
    from public.profiles p
    where p.school_id = v_school and p.status = 'active' and p.role in ('student', 'ambassador')
      and (p_program is null or p.program = p_program)
      and (p_study_year is null or p.study_year = p_study_year)
    returning 1
  )
  select count(*) into v_count from sent;

  insert into public.announcements (school_id, author_id, title, body, activity_id, target, recipients_count)
  values (v_school, auth.uid(), trim(p_title), trim(p_body), p_activity_id,
          jsonb_strip_nulls(jsonb_build_object('program', p_program, 'study_year', p_study_year)), v_count);
  return v_count;
end;
$$;

create function public.admin_list_announcements(p_school_id uuid default null) returns setof public.announcements
language sql stable security definer set search_path = '' as $$
  select * from public.announcements where school_id = private.admin_scope(p_school_id) order by sent_at desc limit 100;
$$;

-- DASHBOARD (F-DASH) ------------------------------------------------------------------------------

-- F-DASH-02 : l'app signale une ouverture (au plus une écriture par heure et par compte).
create function public.touch_last_seen() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set last_seen_at = now()
  where id = auth.uid() and status = 'active' and (last_seen_at is null or last_seen_at < now() - interval '1 hour');
$$;

-- SEUL point d'accès aux statistiques. Tout est agrégé ; tout groupe de moins de 5 étudiants est masqué
-- (k-anonymat) : la population filtrée, chaque segment formation / année, les nouveaux arrivants,
-- les réponses au sondage, et les moyennes calculées sur moins de 5 personnes.
-- Les taux sont des fractions entre 0 et 1.
create function public.dashboard_stats(
  p_school_id uuid, p_from date, p_to date, p_program text default null, p_study_year int default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  k constant int := 5;
  v_school uuid := private.admin_scope(p_school_id);
  v_from timestamptz := p_from::timestamptz;
  v_to timestamptz := (p_to + 1)::timestamptz; -- le dernier jour est inclus
  v_ids uuid[];
  v_n int;
  v_engaged int;
  v_meetings numeric;
  v_sociable int;
  v_registrations int;
  v_presences int;
  v_newcomers int;
  v_newcomers_engaged int;
  v_declared int;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'period_invalid';
  end if;

  v_ids := array(
    select id from public.profiles
    where school_id = v_school and status = 'active' and role in ('student', 'ambassador')
      and (p_program is null or program = p_program)
      and (p_study_year is null or study_year = p_study_year));
  v_n := cardinality(v_ids);
  if v_n < k then
    return jsonb_build_object('masked', true, 'threshold', k);
  end if;

  -- Présences validées sur la période, pour toute l'école (on « rencontre » aussi hors du filtre).
  with presences as (
    select p.user_id, p.activity_id
    from public.activity_participants p join public.activities a on a.id = p.activity_id
    where a.school_id = v_school and p.checked_in_at >= v_from and p.checked_in_at < v_to
  ),
  met as (
    select mine.user_id, count(distinct other.user_id) as people
    from presences mine
    left join presences other on other.activity_id = mine.activity_id and other.user_id <> mine.user_id
    where mine.user_id = any (v_ids)
    group by mine.user_id
  )
  select count(*), coalesce(sum(people), 0), count(*) filter (where people >= 3)
    into v_engaged, v_meetings, v_sociable from met;

  select count(*), count(*) filter (where p.checked_in_at is not null)
    into v_registrations, v_presences
    from public.activity_participants p join public.activities a on a.id = p.activity_id
    where a.school_id = v_school and a.status = 'published' and a.starts_at >= v_from and a.starts_at < v_to
      and a.ends_at < now() and p.status = 'registered' and p.user_id = any (v_ids);

  select count(*), count(*) filter (where exists (
      select 1 from public.activity_participants ap
      where ap.user_id = p.id and ap.checked_in_at between p.created_at and p.created_at + interval '30 days'))
    into v_newcomers, v_newcomers_engaged
    from public.profiles p where p.id = any (v_ids) and p.is_newcomer;

  select declared_student_count into v_declared from public.schools where id = v_school;

  v_result := jsonb_build_object(
    'masked', false,
    'threshold', k,
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'filters', jsonb_strip_nulls(jsonb_build_object('program', p_program, 'study_year', p_study_year)),
    -- F-DASH-01
    'registered', v_n,
    'adoption_rate', case when p_program is null and p_study_year is null and v_declared > 0
                          then round(v_n::numeric / v_declared, 3) end,
    -- F-DASH-02
    'active_7d', (select count(*) from public.profiles where id = any (v_ids) and last_seen_at > now() - interval '7 days'),
    'active_30d', (select count(*) from public.profiles where id = any (v_ids) and last_seen_at > now() - interval '30 days'),
    -- F-DASH-03
    'engaged', v_engaged,
    'engagement_rate', round(v_engaged::numeric / v_n, 3),
    -- F-DASH-04 : moyenne masquée si elle porte sur moins de 5 étudiants engagés.
    'sociability_index', case when v_engaged >= k then round(v_meetings / v_engaged, 1) end,
    -- F-DASH-05
    'sociability_rate', round(v_sociable::numeric / v_n, 3),
    -- F-DASH-07
    'participation_rate', case when v_registrations > 0 then round(v_presences::numeric / v_registrations, 3) end,
    -- F-DASH-09
    'newcomers', case when v_newcomers >= k
      then jsonb_build_object('count', v_newcomers, 'engaged_30d_rate', round(v_newcomers_engaged::numeric / v_newcomers, 3))
      else jsonb_build_object('masked', true) end
  );

  -- F-DASH-06 et 08 : activités de l'école sur la période (indépendant des filtres étudiants).
  v_result := v_result || (
    select jsonb_build_object(
      'activities', jsonb_build_object(
        'total', count(*),
        'official', count(*) filter (where a.is_official),
        'student', count(*) filter (where not a.is_official),
        'by_category', coalesce((
          select jsonb_object_agg(category, n) from (
            select category, count(*) as n from public.activities
            where school_id = v_school and status = 'published' and starts_at >= v_from and starts_at < v_to
            group by category) c), '{}'::jsonb)),
      'fill_rate', (
        select case when sum(a2.max_participants) > 0 then round(sum(reg.n)::numeric / sum(a2.max_participants), 3) end
        from public.activities a2
        cross join lateral (select count(*) as n from public.activity_participants p
                            where p.activity_id = a2.id and p.status = 'registered') reg
        where a2.school_id = v_school and a2.status = 'published' and a2.max_participants is not null
          and a2.starts_at >= v_from and a2.starts_at < v_to))
    from public.activities a
    where a.school_id = v_school and a.status = 'published' and a.starts_at >= v_from and a.starts_at < v_to
  );

  -- F-DASH-10 : parrainage (école entière).
  v_result := v_result || jsonb_build_object('mentoring', jsonb_build_object(
    'active_pairs', (select count(*) from public.mentorships where school_id = v_school and status = 'active'),
    'pending_requests', (select count(*) from public.mentorships where school_id = v_school and status in ('requested', 'proposed')),
    'volunteer_mentors', (select count(*) from public.profiles where school_id = v_school and status = 'active' and is_mentor)));

  -- F-DASH-11 : engagement par formation et par année ; segments de moins de 5 masqués.
  v_result := v_result || jsonb_build_object(
    'by_program', (
      select coalesce(jsonb_agg(case when s.n >= k
               then jsonb_build_object('label', s.label, 'students', s.n, 'engagement_rate', round(s.engaged::numeric / s.n, 3))
               else jsonb_build_object('label', s.label, 'masked', true) end order by s.label), '[]'::jsonb)
      from (
        select coalesce(p.program, 'Non renseignée') as label, count(*) as n,
               count(*) filter (where exists (
                 select 1 from public.activity_participants ap
                 where ap.user_id = p.id and ap.checked_in_at >= v_from and ap.checked_in_at < v_to)) as engaged
        from public.profiles p where p.id = any (v_ids) group by 1) s),
    'by_study_year', (
      select coalesce(jsonb_agg(case when s.n >= k
               then jsonb_build_object('label', s.label, 'students', s.n, 'engagement_rate', round(s.engaged::numeric / s.n, 3))
               else jsonb_build_object('label', s.label, 'masked', true) end order by s.label), '[]'::jsonb)
      from (
        select coalesce(p.study_year::text, 'Non renseignée') as label, count(*) as n,
               count(*) filter (where exists (
                 select 1 from public.activity_participants ap
                 where ap.user_id = p.id and ap.checked_in_at >= v_from and ap.checked_in_at < v_to)) as engaged
        from public.profiles p where p.id = any (v_ids) group by 1) s));

  -- F-DASH-12 : score d'intégration déclaré, à l'inscription et à J+60 ; masqué sous 5 réponses.
  v_result := v_result || jsonb_build_object('integration', (
    select jsonb_object_agg(w.wave, case when w.n >= k
             then jsonb_build_object('responses', w.n, 'average', round(w.average, 1))
             else jsonb_build_object('masked', true) end)
    from (
      select waves.wave, count(s.score) as n, avg(s.score) as average
      from (values ('signup'), ('d60')) as waves (wave)
      left join public.integration_surveys s
        on s.wave = waves.wave and s.score is not null and s.user_id = any (v_ids)
      group by waves.wave) w));

  -- F-DASH-13 : évolution hebdomadaire de l'engagement, de la sociabilité et du nombre d'activités.
  v_result := v_result || jsonb_build_object('weekly', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'week', w.week_start::date,
             'engagement_rate', round(w.engaged::numeric / v_n, 3),
             'sociability_index', case when w.engaged >= k then round(w.meetings / w.engaged, 1) end,
             'activities', w.activities) order by w.week_start), '[]'::jsonb)
    from (
      select weeks.week_start,
        (select count(*) from public.activities a
          where a.school_id = v_school and a.status = 'published'
            and a.starts_at >= weeks.week_start and a.starts_at < weeks.week_start + interval '7 days') as activities,
        coalesce(m.engaged, 0) as engaged,
        coalesce(m.meetings, 0) as meetings
      from generate_series(date_trunc('week', v_from), v_to - interval '1 second', interval '7 days') as weeks (week_start)
      left join lateral (
        select count(*) as engaged, coalesce(sum(people), 0) as meetings from (
          select mine.user_id, count(distinct other.user_id) as people
          from public.activity_participants mine
          join public.activities a on a.id = mine.activity_id and a.school_id = v_school
          left join public.activity_participants other
            on other.activity_id = mine.activity_id and other.user_id <> mine.user_id and other.checked_in_at is not null
          where mine.user_id = any (v_ids)
            and mine.checked_in_at >= weeks.week_start and mine.checked_in_at < weeks.week_start + interval '7 days'
          group by mine.user_id) per_student
      ) m on true) w));

  return v_result;
end;
$$;

-- DROITS ---------------------------------------------------------------------------------------

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_school_id() to authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.is_blocked_with(uuid) to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.conversation_writable(uuid) to authenticated;
grant execute on function private.category_codes() to authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'accept_admin_invite(text, text)', 'admin_context()', 'admin_get_school(uuid)', 'admin_update_school(uuid, jsonb)',
    'admin_create_school(text, text, text[])', 'admin_invite(text, text, uuid)', 'admin_list_admins(uuid)', 'admin_overview()',
    'admin_search_students(uuid, text)', 'admin_set_role(uuid, text)', 'admin_set_status(uuid, text)',
    'admin_list_resources(uuid)', 'admin_save_resource(uuid, uuid, text, text, text, text, text, int)', 'admin_delete_resource(uuid)',
    'redeem_reward(uuid)', 'admin_list_rewards(uuid)', 'admin_save_reward(uuid, uuid, text, text, text, int, int, boolean)',
    'admin_list_redemptions(uuid)', 'admin_set_redemption(uuid, text)',
    'admin_send_announcement(uuid, text, text, uuid, text, int)', 'admin_list_announcements(uuid)',
    'touch_last_seen()', 'dashboard_stats(uuid, date, date, text, int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- Appelée avant la connexion, donc sans session.
revoke all on function public.check_admin_email(text) from public;
grant execute on function public.check_admin_email(text) to anon, authenticated;
