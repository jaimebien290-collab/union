-- NOTIFICATIONS PUSH (F-NOTIF) : jetons des téléphones, messages, rappels J-1 et H-1, réglages par type,
-- heures calmes, envoi. Tout se fait en base : la file `notifications` est vidée chaque minute vers le
-- service Expo Push par pg_net, sans Edge Function ni clé de service.

-- JETONS -------------------------------------------------------------------------------

-- Un téléphone = un jeton = un seul compte à la fois (celui qui s'y est connecté en dernier).
create function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.current_school_id() is null then
    raise exception 'not_authenticated';
  end if;
  if p_token !~ '^Expo(nent)?PushToken\[.+\]$' or p_platform not in ('ios', 'android') then
    raise exception 'push_token_invalid';
  end if;
  delete from public.push_tokens where token = p_token;
  insert into public.push_tokens (user_id, token, platform) values (auth.uid(), p_token, p_platform);
end;
$$;

-- À la déconnexion : ce téléphone ne reçoit plus rien pour ce compte.
create function public.unregister_push_token(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

-- TYPES ET RÉGLAGES (F-NOTIF-10) ------------------------------------------------------------

-- Famille de réglage d'un type de notification. profiles.notification_prefs = {"famille": false} la coupe.
-- « moderation » n'est pas réglable : un avertissement ou le retour d'un signalement arrive toujours.
create function private.notification_category(p_type text) returns text
language sql immutable as $$
  select case
    when p_type in ('reminder_day', 'reminder_hour') then 'reminders'
    when p_type in ('activity_updated', 'activity_cancelled', 'waitlist_promoted') then 'activities'
    when p_type = 'message' then 'messages'
    when p_type like 'mentorship%' then 'mentoring'
    when p_type = 'announcement' then 'announcements'
    when p_type in ('badge_unlocked', 'reward_update') then 'rewards'
    else 'moderation'
  end;
$$;

-- Écran à ouvrir quand on touche la notification (F-NOTIF-11).
create function private.notification_url(p_type text, p_data jsonb) returns text
language sql immutable as $$
  select case
    when p_data ? 'conversation_id' then '/conversation/' || (p_data ->> 'conversation_id')
    when p_data ? 'activity_id' then '/activity/' || (p_data ->> 'activity_id')
    when p_type like 'mentorship%' then '/mentoring'
    when p_type = 'badge_unlocked' then '/points'
    when p_type = 'reward_update' then '/shop'
    else '/notifications'
  end;
$$;

-- F-NOTIF-12 : pas d'envoi entre 22 h et 8 h (heure de Paris), sauf messages privés et rappels « dans 1 h ».
create function private.in_quiet_hours(p_at timestamptz) returns boolean
language sql stable as $$
  select extract(hour from p_at at time zone 'Europe/Paris') >= 22 or extract(hour from p_at at time zone 'Europe/Paris') < 8;
$$;

-- MESSAGES (F-NOTIF-04) ----------------------------------------------------------------------

-- Une notification par conversation tant qu'elle n'est pas partie : les messages suivants la regroupent.
-- Pas de notification si la conversation est en sourdine (F-CHAT-07) ou si l'expéditeur est bloqué.
create function private.notify_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conversation public.conversations;
  v_title text;
  v_preview text := case when char_length(new.content) > 120 then left(new.content, 117) || '…' else new.content end;
  v_member record;
begin
  select * into v_conversation from public.conversations where id = new.conversation_id;
  select case when v_conversation.type = 'activity'
              then (select a.title from public.activities a where a.id = v_conversation.activity_id)
              else p.first_name || ' ' || p.last_name end
    into v_title from public.profiles p where p.id = new.sender_id;

  for v_member in
    select m.user_id from public.conversation_members m
    where m.conversation_id = new.conversation_id and m.user_id <> new.sender_id and m.left_at is null and not m.muted
      and not exists (select 1 from public.blocks b
                      where (b.blocker_id = m.user_id and b.blocked_id = new.sender_id)
                         or (b.blocker_id = new.sender_id and b.blocked_id = m.user_id))
  loop
    update public.notifications set body = 'Plusieurs nouveaux messages', created_at = now()
      where user_id = v_member.user_id and type = 'message' and sent_at is null
        and data ->> 'conversation_id' = new.conversation_id::text;
    if not found then
      insert into public.notifications (school_id, user_id, type, title, body, data)
      values (new.school_id, v_member.user_id, 'message', coalesce(v_title, 'Nouveau message'), v_preview,
              jsonb_build_object('conversation_id', new.conversation_id));
    end if;
  end loop;
  return new;
end;
$$;

create trigger messages_notify
  after insert on public.messages
  for each row execute function private.notify_message();

-- RAPPELS (F-NOTIF-01) ----------------------------------------------------------------------

-- Un seul rappel de chaque sorte par personne et par activité.
create unique index notifications_reminder_once on public.notifications (user_id, type, (data ->> 'activity_id'))
  where type in ('reminder_day', 'reminder_hour');

-- « Ton activité X commence demain à 18h » : déposé la veille à partir de 18 h (heure de Paris).
-- « … dans 1 h » : déposé dans l'heure qui précède le début.
create function private.enqueue_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamp := now() at time zone 'Europe/Paris';
begin
  if extract(hour from v_now) >= 18 then
    insert into public.notifications (school_id, user_id, type, title, body, data)
    select a.school_id, p.user_id, 'reminder_day', a.title,
           'Ton activité commence demain à ' || to_char(a.starts_at at time zone 'Europe/Paris', 'HH24"h"MI') || '.',
           jsonb_build_object('activity_id', a.id)
    from public.activities a join public.activity_participants p on p.activity_id = a.id and p.status = 'registered'
    where a.status = 'published' and (a.starts_at at time zone 'Europe/Paris')::date = v_now::date + 1
    on conflict do nothing;
  end if;

  insert into public.notifications (school_id, user_id, type, title, body, data)
  select a.school_id, p.user_id, 'reminder_hour', a.title,
         'Ton activité commence dans moins d''une heure, à ' || to_char(a.starts_at at time zone 'Europe/Paris', 'HH24"h"MI') || '.',
         jsonb_build_object('activity_id', a.id)
  from public.activities a join public.activity_participants p on p.activity_id = a.id and p.status = 'registered'
  where a.status = 'published' and a.starts_at > now() and a.starts_at <= now() + interval '1 hour'
  on conflict do nothing;
end;
$$;

-- ENVOI -------------------------------------------------------------------------------------

-- Prend les notifications à envoyer maintenant et les marque parties. Renvoie une ligne par téléphone.
-- Restent en attente : celles retenues par les heures calmes. Sont marquées sans être envoyées : celles dont
-- le type est coupé dans les réglages, ou dont le destinataire n'a pas de téléphone enregistré (elles
-- restent lisibles dans l'app). Rien de plus vieux que 24 h n'est envoyé.
create function private.claim_push_batch(p_limit int default 500)
returns table (token text, title text, body text, data jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  return query
    with due as (
      select n.id, n.user_id, n.type, n.title, n.body, n.data, n.created_at
      from public.notifications n
      where n.sent_at is null
        and (not private.in_quiet_hours(now()) or n.type in ('message', 'reminder_hour'))
      order by n.created_at
      limit p_limit
      for update skip locked
    ),
    marked as (
      update public.notifications n set sent_at = now() from due where n.id = due.id returning n.id
    )
    select t.token, due.title::text, due.body::text,
           due.data || jsonb_build_object('type', due.type, 'url', private.notification_url(due.type, due.data))
    from due
    join public.profiles p on p.id = due.user_id and p.status = 'active'
    join public.push_tokens t on t.user_id = due.user_id
    where coalesce((p.notification_prefs ->> private.notification_category(due.type))::boolean, true)
      and due.id in (select marked.id from marked)
      and due.created_at > now() - interval '24 hours';
end;
$$;

-- Envoie le lot au service Expo Push, par paquets de 100 (limite de l'API). Nécessite l'extension pg_net.
create function private.dispatch_push() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_messages jsonb;
  v_count int;
  v_offset int := 0;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'to', b.token, 'title', b.title, 'body', b.body, 'data', b.data, 'sound', 'default', 'channelId', 'default')), '[]'::jsonb)
    into v_messages from private.claim_push_batch() b;
  v_count := jsonb_array_length(v_messages);

  while v_offset < v_count loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
      body := (select jsonb_agg(m) from (
                 select m from jsonb_array_elements(v_messages) with ordinality as e (m, i)
                 where i > v_offset and i <= v_offset + 100) chunk));
    v_offset := v_offset + 100;
  end loop;
  return v_count;
end;
$$;

-- Passe toutes les minutes : rappels, propositions de parrainage expirées, puis envoi.
create function private.push_tick() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.enqueue_reminders();
  perform private.expire_mentorship_proposals();
  perform private.dispatch_push();
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_school_id() to authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.is_blocked_with(uuid) to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.conversation_writable(uuid) to authenticated;
grant execute on function private.category_codes() to authenticated;

revoke all on function public.register_push_token(text, text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- PLANIFICATION ------------------------------------------------------------------------------
-- Sur Supabase : active pg_net et pg_cron, puis planifie le passage chaque minute. Ailleurs (tests), ces
-- extensions n'existent pas : le bloc ne fait rien.
do $$
begin
  begin
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_net / pg_cron indisponibles : envoi push non planifié (%).', sqlerrm;
  end;
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    execute $job$ select cron.schedule('union-push', '* * * * *', 'select private.push_tick()') $job$;
  end if;
end;
$$;
