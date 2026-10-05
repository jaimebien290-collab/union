-- LOT 3 — Social : messagerie (F-CHAT), blocage, signalements et modération (F-MOD), notifications dans l'app.
-- L'envoi push et les rappels J-1 / H-1 restent à faire (compte Expo et build de développement nécessaires).

-- BLOCAGE (F-CHAT-05) -------------------------------------------------------------

create table public.blocks (
  blocker_id uuid not null references public.profiles (id),
  blocked_id uuid not null references public.profiles (id),
  school_id uuid not null references public.schools (id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

-- Vrai si l'un des deux a bloqué l'autre. Le blocage masque dans les deux sens, sans prévenir.
create function private.is_blocked_with(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = p_other)
       or (blocker_id = p_other and blocked_id = auth.uid())
  );
$$;

revoke all on function private.is_blocked_with(uuid) from public;
grant execute on function private.is_blocked_with(uuid) to authenticated;

create function private.blocks_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.blocker_id := auth.uid();
  new.school_id := private.current_school_id();
  if not exists (select 1 from public.profiles where id = new.blocked_id and school_id = new.school_id) then
    raise exception 'user_unavailable';
  end if;
  return new;
end;
$$;

create trigger blocks_before_insert
  before insert on public.blocks
  for each row execute function private.blocks_before_insert();

alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
grant select, delete on public.blocks to authenticated;
grant insert (blocked_id) on public.blocks to authenticated;

-- On ne voit que les blocages qu'on a posés : la personne bloquée n'en sait rien.
create policy blocks_select_own on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert_own on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete_own on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- « Nous ne nous voyons plus dans les listes » : les profils bloqués disparaissent de public_profiles,
-- donc des participants, des fiches profil et des photos.
create or replace view public.public_profiles
with (security_invoker = false, security_barrier = true) as
  select id, school_id, first_name, last_name, program, study_year, bio, avatar_url, interests, role, is_mentor
  from public.profiles
  where status = 'active'
    and school_id = private.current_school_id()
    and not private.is_blocked_with(id);

-- Les personnes bloquées n'étant plus visibles, il faut une fonction pour les lister et les débloquer.
create function public.my_blocked_users()
returns table (id uuid, first_name text, last_name text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.first_name, p.last_name, b.created_at
  from public.blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

revoke all on function public.my_blocked_users() from public, anon;
grant execute on function public.my_blocked_users() to authenticated;

-- MESSAGERIE ------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  type text not null check (type in ('activity', 'direct', 'mentorship')),
  activity_id uuid unique references public.activities (id) on delete cascade,
  -- Pour une conversation privée : les deux identifiants triés, pour n'en avoir qu'une par binôme.
  direct_key text unique,
  last_message_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check ((type = 'activity') = (activity_id is not null))
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  -- Rempli quand on quitte (désinscription de l'activité) : l'historique reste, l'accès s'arrête.
  left_at timestamptz,
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members (user_id) where left_at is null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  school_id uuid not null references public.schools (id),
  sender_id uuid not null references public.profiles (id),
  content varchar(2000) not null check (char_length(trim(content)) > 0),
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  -- Rempli par la modération (ou par le masquage automatique à 3 signalements).
  hidden_at timestamptz
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);

create function private.is_member(p_conversation_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid() and left_at is null
  );
$$;

-- Peut-on encore écrire ? Activité : jusqu'à 7 jours après la fin (F-CHAT-01). Privé : tant que personne
-- n'a bloqué l'autre et que l'autre compte est actif.
create function private.conversation_writable(p_conversation_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case c.type
    when 'activity' then
      exists (select 1 from public.activities a
              where a.id = c.activity_id and a.status <> 'hidden' and now() < a.ends_at + interval '7 days')
    else
      exists (select 1 from public.conversation_members m join public.profiles p on p.id = m.user_id
              where m.conversation_id = c.id and m.user_id <> auth.uid()
                and p.status = 'active' and not private.is_blocked_with(m.user_id))
  end
  from public.conversations c where c.id = p_conversation_id;
$$;

revoke all on function private.is_member(uuid) from public;
revoke all on function private.conversation_writable(uuid) from public;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.conversation_writable(uuid) to authenticated;

-- F-CHAT-09 : filtre basique. Le message part quand même, mais il est marqué pour revue.
create function private.looks_abusive(p_text text) returns boolean
language sql immutable as $$
  select lower(p_text) ~ '\m(connard|connasse|salope|pute|encul[ée]s?|fdp|ntm|tapette|b[âa]tard|nique ta)\M';
$$;

create function private.messages_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conversation public.conversations;
begin
  new.sender_id := auth.uid();
  new.content := trim(new.content);
  new.created_at := now();
  new.hidden_at := null;

  select * into v_conversation from public.conversations where id = new.conversation_id;
  if not found or not private.is_member(new.conversation_id) then
    raise exception 'conversation_not_found';
  end if;
  new.school_id := v_conversation.school_id;

  if not private.conversation_writable(new.conversation_id) then
    raise exception 'conversation_read_only';
  end if;
  -- NF-SEC-04
  if (select count(*) from public.messages
      where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too_many_messages';
  end if;

  new.flagged := private.looks_abusive(new.content);
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function private.messages_before_insert();

-- SIGNALEMENTS (table déclarée ici car le trigger des messages y écrit) -------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  -- null = signalement automatique (filtre d'insultes).
  reporter_id uuid references public.profiles (id),
  target_type text not null check (target_type in ('activity', 'message', 'user')),
  target_id uuid not null,
  -- Auteur du contenu signalé (ou utilisateur signalé) : sert à F-MOD-07 et aux avertissements.
  target_user_id uuid not null references public.profiles (id),
  reason text not null check (reason in ('inappropriate', 'harassment', 'spam', 'fake_profile', 'danger', 'other', 'auto_filter')),
  comment text check (char_length(comment) <= 500),
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  handled_by uuid references public.profiles (id),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create index reports_open_idx on public.reports (school_id, created_at) where status = 'open';

alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;

-- Chacun revoit ses propres signalements ; la file de modération passe par moderation_queue().
create policy reports_select_own on public.reports for select to authenticated using (reporter_id = auth.uid());

create function private.messages_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  -- Sa propre conversation est lue jusqu'à son propre message.
  update public.conversation_members set last_read_at = new.created_at
    where conversation_id = new.conversation_id and user_id = new.sender_id;
  if new.flagged then
    insert into public.reports (school_id, reporter_id, target_type, target_id, target_user_id, reason)
    values (new.school_id, null, 'message', new.id, new.sender_id, 'auto_filter');
  end if;
  return new;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function private.messages_after_insert();

-- Discussion de groupe par activité (F-CHAT-01) : créée avec l'activité, membres = inscrits.
create or replace function private.activities_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.conversations (school_id, type, activity_id) values (new.school_id, 'activity', new.id);
  insert into public.activity_participants (activity_id, user_id, school_id, status)
  values (new.id, new.creator_id, new.school_id, 'registered');
  return new;
end;
$$;

-- Une seule règle pour l'inscription, la désinscription, la promotion et la suppression de compte :
-- inscrit = membre, sinon l'accès à la discussion s'arrête.
create function private.sync_activity_chat_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conversation_id uuid;
begin
  select id into v_conversation_id from public.conversations where activity_id = new.activity_id;
  if v_conversation_id is null then
    return new;
  end if;
  if new.status = 'registered' then
    insert into public.conversation_members (conversation_id, user_id)
    values (v_conversation_id, new.user_id)
    on conflict (conversation_id, user_id) do update set left_at = null, joined_at = now(), last_read_at = now();
  else
    update public.conversation_members set left_at = now()
      where conversation_id = v_conversation_id and user_id = new.user_id and left_at is null;
  end if;
  return new;
end;
$$;

create trigger activity_participants_sync_chat
  after insert or update of status on public.activity_participants
  for each row execute function private.sync_activity_chat_member();

-- Activités créées avant cette migration.
insert into public.conversations (school_id, type, activity_id)
  select a.school_id, 'activity', a.id from public.activities a
  where not exists (select 1 from public.conversations c where c.activity_id = a.id);
insert into public.conversation_members (conversation_id, user_id)
  select c.id, p.user_id from public.activity_participants p join public.conversations c on c.activity_id = p.activity_id
  where p.status = 'registered'
  on conflict do nothing;

-- F-CHAT-02 : ouvre (ou retrouve) la conversation privée avec un étudiant de mon école.
create function public.open_direct_conversation(p_user_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_school_id uuid := private.current_school_id();
  v_key text;
  v_id uuid;
begin
  if v_school_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_user_id = v_uid
     or private.is_blocked_with(p_user_id)
     or not exists (select 1 from public.profiles where id = p_user_id and school_id = v_school_id and status = 'active') then
    raise exception 'user_unavailable';
  end if;

  v_key := least(v_uid::text, p_user_id::text) || ':' || greatest(v_uid::text, p_user_id::text);
  select id into v_id from public.conversations where direct_key = v_key;
  if v_id is null then
    insert into public.conversations (school_id, type, direct_key) values (v_school_id, 'direct', v_key) returning id into v_id;
    insert into public.conversation_members (conversation_id, user_id) values (v_id, v_uid), (v_id, p_user_id);
  end if;
  return v_id;
end;
$$;

revoke all on function public.open_direct_conversation(uuid) from public, anon;
grant execute on function public.open_direct_conversation(uuid) to authenticated;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
revoke all on public.conversations, public.conversation_members, public.messages from anon, authenticated;

grant select on public.conversations, public.conversation_members, public.messages to authenticated;
grant update (last_read_at, muted) on public.conversation_members to authenticated;
grant insert (conversation_id, content) on public.messages to authenticated;

create policy conversations_select_member on public.conversations
  for select to authenticated using (private.is_member(id));

create policy conversation_members_select on public.conversation_members
  for select to authenticated using (private.is_member(conversation_id));

create policy conversation_members_update_own on public.conversation_members
  for update to authenticated
  using (user_id = auth.uid() and left_at is null)
  with check (user_id = auth.uid());

-- Les messages masqués par la modération et ceux d'une personne bloquée ne sont plus servis.
create policy messages_select_member on public.messages
  for select to authenticated
  using (private.is_member(conversation_id) and hidden_at is null and not private.is_blocked_with(sender_id));

create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and private.is_member(conversation_id));

-- Temps réel (F-CHAT-04) : sur Supabase, les nouveaux messages sont diffusés aux membres (la RLS s'applique).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

-- Liste de mes conversations : titre, dernier message, non-lus. Les discussions d'activité disparaissent
-- 30 jours après la fin (archivage, F-CHAT-01) ; les conversations avec une personne bloquée aussi.
create view public.conversation_list with (security_invoker = true) as
  select
    c.id, c.type, c.activity_id, c.last_message_at, c.created_at,
    me.muted, me.last_read_at,
    a.title as activity_title, a.category as activity_category,
    other.user_id as other_id,
    o.first_name as other_first_name, o.last_name as other_last_name, o.avatar_url as other_avatar_url,
    private.conversation_writable(c.id) as writable,
    last_message.content as last_message, last_message.sender_id as last_sender_id,
    (select count(*)::int from public.messages x
      where x.conversation_id = c.id and x.created_at > me.last_read_at and x.sender_id <> auth.uid()) as unread_count
  from public.conversations c
  join public.conversation_members me
    on me.conversation_id = c.id and me.user_id = auth.uid() and me.left_at is null
  left join public.activities a on a.id = c.activity_id
  left join lateral (
    select m.user_id from public.conversation_members m
    where m.conversation_id = c.id and m.user_id <> auth.uid() and c.type <> 'activity'
    limit 1
  ) other on true
  left join public.public_profiles o on o.id = other.user_id
  left join lateral (
    select x.content, x.sender_id from public.messages x
    where x.conversation_id = c.id order by x.created_at desc limit 1
  ) last_message on true
  where (c.type = 'activity' and a.status <> 'hidden' and now() < a.ends_at + interval '30 days')
     or (c.type <> 'activity' and not private.is_blocked_with(other.user_id));

revoke all on public.conversation_list from anon, authenticated;
grant select on public.conversation_list to authenticated;

-- NOTIFICATIONS DANS L'APP -----------------------------------------------------------

alter table public.notifications add column read_at timestamptz;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- MODÉRATION (F-MOD) -----------------------------------------------------------------

-- Seules les fonctions serveur changent le statut d'une activité : dans ce cas on saute les règles
-- d'édition (une activité terminée doit pouvoir être masquée, une activité masquée à tort rétablie).
create or replace function private.activities_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    return new;
  end if;
  if old.status <> 'published' or old.ends_at < now() then
    raise exception 'activity_locked';
  end if;
  new.title := trim(new.title);
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

create function private.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_role() in ('ambassador', 'school_admin'), false);
$$;

-- Masque ou rétablit un contenu. Sans effet sur un utilisateur (la suspension est réservée à l'école).
create function private.set_content_hidden(p_target_type text, p_target_id uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_activity public.activities;
begin
  if p_target_type = 'message' then
    update public.messages set hidden_at = case when p_hidden then now() end where id = p_target_id;
  elsif p_target_type = 'activity' then
    if p_hidden then
      update public.activities set status = 'hidden' where id = p_target_id and status = 'published'
        returning * into v_activity;
      if found then
        perform private.notify_participants(v_activity, 'activity_cancelled', 'Cette activité a été retirée.');
      end if;
    else
      update public.activities set status = 'published' where id = p_target_id and status = 'hidden';
    end if;
  end if;
end;
$$;

-- F-MOD-01. Renvoie 'reported', ou 'hidden' si ce signalement a déclenché le masquage automatique (F-MOD-02).
create function public.report_content(p_target_type text, p_target_id uuid, p_reason text, p_comment text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_school_id uuid := private.current_school_id();
  v_author uuid;
begin
  if v_school_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_reason = 'auto_filter' then
    raise exception 'reason_invalid';
  end if;

  -- On ne signale que ce qu'on peut voir, dans son école.
  if p_target_type = 'activity' then
    select creator_id into v_author from public.activities where id = p_target_id and school_id = v_school_id;
  elsif p_target_type = 'message' then
    select sender_id into v_author from public.messages
      where id = p_target_id and school_id = v_school_id and private.is_member(conversation_id);
  elsif p_target_type = 'user' then
    select id into v_author from public.profiles where id = p_target_id and school_id = v_school_id and status = 'active';
  end if;
  if v_author is null then
    raise exception 'report_target_not_found';
  end if;
  if v_author = v_uid then
    raise exception 'report_own_content';
  end if;
  -- NF-SEC-04
  if (select count(*) from public.reports where reporter_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_reports';
  end if;

  insert into public.reports (school_id, reporter_id, target_type, target_id, target_user_id, reason, comment)
  values (v_school_id, v_uid, p_target_type, p_target_id, v_author, p_reason, nullif(trim(p_comment), ''))
  on conflict (reporter_id, target_type, target_id) do nothing;

  if p_target_type <> 'user'
     and (select count(distinct reporter_id) from public.reports
          where target_type = p_target_type and target_id = p_target_id and status = 'open' and reporter_id is not null) >= 3 then
    perform private.set_content_hidden(p_target_type, p_target_id, true);
    return 'hidden';
  end if;
  return 'reported';
end;
$$;

-- F-MOD-03 : file de modération, un élément par contenu signalé. F-MOD-07 : jamais ce qui me concerne.
create function public.moderation_queue()
returns table (
  target_type text, target_id uuid, target_user_id uuid, author_name text,
  report_count int, reasons text[], comments text[], first_reported_at timestamptz,
  preview text, is_hidden boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_moderator() then
    raise exception 'not_moderator';
  end if;
  return query
    select
      r.target_type, r.target_id, r.target_user_id,
      (select p.first_name || ' ' || p.last_name from public.profiles p where p.id = r.target_user_id)::text,
      count(*)::int,
      array_agg(distinct r.reason)::text[],
      array_remove(array_agg(r.comment), null)::text[],
      min(r.created_at),
      case r.target_type
        when 'activity' then (select a.title || coalesce(E'\n' || a.description, '') from public.activities a where a.id = r.target_id)
        when 'message' then (select m.content::text from public.messages m where m.id = r.target_id)
        else (select coalesce(p.bio, '')::text from public.profiles p where p.id = r.target_id)
      end::text,
      case r.target_type
        when 'activity' then exists (select 1 from public.activities a where a.id = r.target_id and a.status = 'hidden')
        when 'message' then exists (select 1 from public.messages m where m.id = r.target_id and m.hidden_at is not null)
        else false
      end
    from public.reports r
    where r.school_id = private.current_school_id()
      and r.status = 'open'
      and r.target_user_id <> auth.uid()
    group by r.target_type, r.target_id, r.target_user_id
    order by min(r.created_at);
end;
$$;

-- Traite tous les signalements ouverts d'un contenu.
--   dismiss : signalement rejeté, le contenu masqué automatiquement est rétabli ;
--   hide    : contenu masqué (activité ou message) ;
--   warn    : l'auteur reçoit un avertissement, le contenu reste en l'état.
-- Dans tous les cas, les signaleurs sont remerciés (F-MOD-05).
create function public.resolve_reports(p_target_type text, p_target_id uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_school_id uuid := private.current_school_id();
  v_author uuid;
begin
  if not private.is_moderator() then
    raise exception 'not_moderator';
  end if;
  if p_action not in ('dismiss', 'hide', 'warn') or (p_action = 'hide' and p_target_type = 'user') then
    raise exception 'action_invalid';
  end if;

  select target_user_id into v_author from public.reports
    where school_id = v_school_id and target_type = p_target_type and target_id = p_target_id and status = 'open'
    limit 1;
  if v_author is null then
    raise exception 'report_target_not_found';
  end if;
  if v_author = v_uid then
    raise exception 'moderator_concerned'; -- F-MOD-07
  end if;

  if p_action = 'dismiss' then
    perform private.set_content_hidden(p_target_type, p_target_id, false);
  elsif p_action = 'hide' then
    perform private.set_content_hidden(p_target_type, p_target_id, true);
  else
    insert into public.notifications (school_id, user_id, type, title, body)
    values (v_school_id, v_author, 'moderation_warning', 'Un rappel de la charte',
            'Un de tes contenus a été signalé. Merci de relire la charte de bonne conduite.');
  end if;

  insert into public.notifications (school_id, user_id, type, title, body)
  select distinct v_school_id, r.reporter_id, 'report_handled', 'Signalement traité', 'Merci, ton signalement a été traité.'
  from public.reports r
  where r.school_id = v_school_id and r.target_type = p_target_type and r.target_id = p_target_id
    and r.status = 'open' and r.reporter_id is not null;

  update public.reports
    set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
        handled_by = v_uid, handled_at = now()
    where school_id = v_school_id and target_type = p_target_type and target_id = p_target_id and status = 'open';
end;
$$;

revoke all on function public.report_content(text, uuid, text, text) from public, anon;
revoke all on function public.moderation_queue() from public, anon;
revoke all on function public.resolve_reports(text, uuid, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;
grant execute on function public.moderation_queue() to authenticated;
grant execute on function public.resolve_reports(text, uuid, text) to authenticated;

-- SUPPRESSION DE COMPTE ET EXPORT : prise en compte du lot 3 ------------------------------

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
                     from public.reports r where r.reporter_id = auth.uid())
  );
$$;
