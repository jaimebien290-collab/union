-- LOT 5 — Parrainage (F-MENT), ressources « Besoin de parler » (F-HELP), mini-sondage d'intégration (F-SURV).

-- PARRAINAGE --------------------------------------------------------------------------

-- Une ligne par demande de parrain. Tant qu'aucun parrain n'est trouvé : status 'requested', mentor_id null
-- (file d'attente). Proposée à un parrain : 'proposed'. Acceptée : 'active'. Terminée : 'ended'.
create table public.mentorships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  mentee_id uuid not null references public.profiles (id),
  mentor_id uuid references public.profiles (id),
  status text not null default 'requested' check (status in ('requested', 'proposed', 'active', 'ended')),
  -- Parrains qui ont refusé ou laissé passer les 72 h : on ne leur repropose pas cette demande.
  declined_mentor_ids uuid[] not null default '{}',
  proposed_at timestamptz,
  accepted_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (mentor_id is distinct from mentee_id),
  check ((status in ('proposed', 'active')) <= (mentor_id is not null))
);

-- Une seule demande en cours par filleul.
create unique index mentorships_one_open_per_mentee on public.mentorships (mentee_id) where status <> 'ended';
create index mentorships_mentor_idx on public.mentorships (mentor_id) where status in ('proposed', 'active');

alter table public.mentorships enable row level security;
revoke all on public.mentorships from anon, authenticated;
grant select on public.mentorships to authenticated;

-- Un parrainage ne regarde que le parrain et le filleul. Écriture par fonctions uniquement.
create policy mentorships_select_own on public.mentorships
  for select to authenticated using (auth.uid() in (mentee_id, mentor_id));

create function private.mentoring_enabled(p_school_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((settings ->> 'mentoring_enabled')::boolean, true) from public.schools where id = p_school_id;
$$;

-- F-MENT-04 : propose la demande au meilleur parrain disponible. Score : même formation +3, parrain dans
-- l'année juste au-dessus +1, +1 par centre d'intérêt commun. À égalité : celui qui a le moins de filleuls.
-- Sans parrain disponible, la demande reste en file d'attente.
create function private.assign_mentor(p_mentorship_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.mentorships;
  v_mentee public.profiles;
  v_mentor uuid;
begin
  select * into v_request from public.mentorships where id = p_mentorship_id and status = 'requested' for update;
  if not found then
    return;
  end if;
  select * into v_mentee from public.profiles where id = v_request.mentee_id;

  select c.id into v_mentor
  from public.profiles c
  cross join lateral (
    select count(*) as load from public.mentorships m
    where m.mentor_id = c.id and m.status in ('proposed', 'active')
  ) l
  where c.school_id = v_request.school_id
    and c.status = 'active'
    and c.is_mentor
    and c.id <> v_request.mentee_id
    and c.id <> all (v_request.declined_mentor_ids)
    and l.load < c.mentor_capacity
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = c.id and b.blocked_id = v_request.mentee_id)
         or (b.blocker_id = v_request.mentee_id and b.blocked_id = c.id)
    )
  order by
    (case when c.program is not null and c.program = v_mentee.program then 3 else 0 end)
    + (case when c.study_year = v_mentee.study_year + 1 then 1 else 0 end)
    + cardinality(array(select unnest(c.interests) intersect select unnest(v_mentee.interests))) desc,
    l.load,
    c.created_at
  limit 1;

  if v_mentor is null then
    update public.mentorships set mentor_id = null, proposed_at = null where id = p_mentorship_id;
    return;
  end if;

  update public.mentorships set status = 'proposed', mentor_id = v_mentor, proposed_at = now()
    where id = p_mentorship_id;
  insert into public.notifications (school_id, user_id, type, title, body, data)
  values (v_request.school_id, v_mentor, 'mentorship_proposed', 'Un nouveau cherche un parrain',
          v_mentee.first_name || ' aimerait que tu sois son parrain. Tu as 72 h pour répondre.',
          jsonb_build_object('mentorship_id', p_mentorship_id));
end;
$$;

-- Tente de servir la file d'attente (les plus anciennes demandes d'abord).
create function private.assign_waiting_mentees(p_school_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.mentorships where school_id = p_school_id and status = 'requested' order by created_at
  loop
    perform private.assign_mentor(v_id);
  end loop;
end;
$$;

-- F-MENT-05 : sans réponse sous 72 h, on passe au parrain suivant.
create function private.expire_mentorship_proposals() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_request record;
begin
  for v_request in
    update public.mentorships
      set status = 'requested', declined_mentor_ids = declined_mentor_ids || mentor_id, mentor_id = null, proposed_at = null
      where status = 'proposed' and proposed_at < now() - interval '72 hours'
      returning id
  loop
    perform private.assign_mentor(v_request.id);
  end loop;
end;
$$;

-- F-MENT-02 : se porter volontaire (2e année ou plus, 1 à 3 filleuls) ou arrêter (0).
-- Arrêter n'interrompt pas les parrainages en cours : on ne reçoit simplement plus de nouvelles demandes.
create function public.set_mentor_status(p_capacity int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid() and status = 'active';
  if not found then
    raise exception 'not_authenticated';
  end if;
  if not private.mentoring_enabled(v_profile.school_id) then
    raise exception 'mentoring_disabled';
  end if;
  if p_capacity is null or p_capacity not between 0 and 3 then
    raise exception 'mentor_capacity_invalid';
  end if;
  if p_capacity > 0 and coalesce(v_profile.study_year, 1) < 2 then
    raise exception 'mentor_first_year';
  end if;

  update public.profiles set is_mentor = p_capacity > 0, mentor_capacity = p_capacity where id = v_profile.id;
  perform private.expire_mentorship_proposals();
  perform private.assign_waiting_mentees(v_profile.school_id);
end;
$$;

-- F-MENT-03 : demander un parrain. Renvoie 'proposed' (un parrain a été sollicité) ou 'requested' (file d'attente).
create function public.request_mentor() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_school_id uuid := private.current_school_id();
  v_id uuid;
begin
  if v_school_id is null then
    raise exception 'not_authenticated';
  end if;
  if not private.mentoring_enabled(v_school_id) then
    raise exception 'mentoring_disabled';
  end if;
  if exists (select 1 from public.mentorships where mentee_id = auth.uid() and status <> 'ended') then
    raise exception 'mentorship_exists';
  end if;

  perform private.expire_mentorship_proposals();
  insert into public.mentorships (school_id, mentee_id) values (v_school_id, auth.uid()) returning id into v_id;
  perform private.assign_mentor(v_id);
  return (select status from public.mentorships where id = v_id);
end;
$$;

-- F-MENT-05 et 06 : le parrain accepte ou refuse. À l'acceptation, la conversation privée s'ouvre avec un
-- message d'accueil, le parrain gagne ses points et son badge.
create function public.respond_mentorship(p_mentorship_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_request public.mentorships;
  v_mentor public.profiles;
  v_mentee public.profiles;
  v_conversation_id uuid;
begin
  perform private.expire_mentorship_proposals();
  select * into v_request from public.mentorships
    where id = p_mentorship_id and mentor_id = v_uid and status = 'proposed' for update;
  if not found then
    raise exception 'mentorship_not_found';
  end if;

  if not coalesce(p_accept, false) then
    update public.mentorships
      set status = 'requested', declined_mentor_ids = declined_mentor_ids || v_uid, mentor_id = null, proposed_at = null
      where id = p_mentorship_id;
    perform private.assign_mentor(p_mentorship_id);
    return;
  end if;

  update public.mentorships set status = 'active', accepted_at = now() where id = p_mentorship_id;
  select * into v_mentor from public.profiles where id = v_uid;
  select * into v_mentee from public.profiles where id = v_request.mentee_id;

  -- Même conversation privée que s'ils s'étaient écrit eux-mêmes : une seule par binôme.
  v_conversation_id := public.open_direct_conversation(v_request.mentee_id);
  insert into public.messages (conversation_id, content)
  values (v_conversation_id,
          'Salut ' || v_mentee.first_name || ' ! Je suis ' || v_mentor.first_name
          || ', ton parrain. N''hésite pas si tu as une question sur l''école ou si tu cherches une activité où aller 🙂');

  perform private.add_points(v_uid, v_request.school_id, 'mentee_accepted', p_mentorship_id::text, null, 10);
  insert into public.user_badges (user_id, badge_code, school_id) values (v_uid, 'mentor', v_request.school_id)
    on conflict (user_id, badge_code) do nothing;
  if found then
    insert into public.notifications (school_id, user_id, type, title, body)
    values (v_request.school_id, v_uid, 'badge_unlocked', 'Nouveau badge 🤝', 'Tu as débloqué « Parrain ». Bravo !');
  end if;

  insert into public.notifications (school_id, user_id, type, title, body, data)
  values (v_request.school_id, v_request.mentee_id, 'mentorship_accepted', 'Tu as un parrain 🎉',
          v_mentor.first_name || ' est ton parrain. Il vient de t''écrire.',
          jsonb_build_object('conversation_id', v_conversation_id));
end;
$$;

-- F-MENT-07 : le parrain ou le filleul met fin au parrainage, sans justification. Le filleul peut aussi
-- retirer une demande encore en attente.
create function public.end_mentorship(p_mentorship_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_request public.mentorships;
  v_other uuid;
begin
  select * into v_request from public.mentorships
    where id = p_mentorship_id and status <> 'ended'
      and (mentee_id = v_uid or (mentor_id = v_uid and status = 'active'))
    for update;
  if not found then
    raise exception 'mentorship_not_found';
  end if;

  update public.mentorships set status = 'ended', ended_at = now() where id = p_mentorship_id;

  if v_request.status = 'active' then
    v_other := case when v_request.mentee_id = v_uid then v_request.mentor_id else v_request.mentee_id end;
    insert into public.notifications (school_id, user_id, type, title, body)
    values (v_request.school_id, v_other, 'mentorship_ended', 'Parrainage terminé', 'Ton parrainage a pris fin.');
    -- Une place de parrain s'est libérée.
    perform private.assign_waiting_mentees(v_request.school_id);
  end if;
end;
$$;

revoke all on function public.set_mentor_status(int) from public, anon;
revoke all on function public.request_mentor() from public, anon;
revoke all on function public.respond_mentorship(uuid, boolean) from public, anon;
revoke all on function public.end_mentorship(uuid) from public, anon;
grant execute on function public.set_mentor_status(int) to authenticated;
grant execute on function public.request_mentor() to authenticated;
grant execute on function public.respond_mentorship(uuid, boolean) to authenticated;
grant execute on function public.end_mentorship(uuid) to authenticated;

-- §6.9 : parrain et filleul présents à la même activité → +15 chacun, une fois par mois et par binôme.
create function private.award_mentor_pair() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pair record;
  v_key text;
begin
  for v_pair in
    select m.id, m.school_id, m.mentor_id, m.mentee_id
    from public.mentorships m
    join public.activity_participants other
      on other.activity_id = new.activity_id and other.checked_in_at is not null
     and other.user_id = case when m.mentor_id = new.user_id then m.mentee_id else m.mentor_id end
    where m.status = 'active' and new.user_id in (m.mentor_id, m.mentee_id)
  loop
    v_key := v_pair.id::text || ':' || to_char(now(), 'YYYY-MM');
    perform private.add_points(v_pair.mentor_id, v_pair.school_id, 'mentor_pair_attendance', v_key, new.activity_id, 15);
    perform private.add_points(v_pair.mentee_id, v_pair.school_id, 'mentor_pair_attendance', v_key, new.activity_id, 15);
  end loop;
  return new;
end;
$$;

create trigger activity_participants_mentor_pair
  after update of checked_in_at on public.activity_participants
  for each row when (old.checked_in_at is null and new.checked_in_at is not null)
  execute function private.award_mentor_pair();

-- RESSOURCES « BESOIN DE PARLER » (F-HELP) -----------------------------------------------

create table public.support_resources (
  id uuid primary key default gen_random_uuid(),
  -- null = ressource nationale, visible de toutes les écoles.
  school_id uuid references public.schools (id) on delete cascade,
  name text not null,
  description text,
  phone text,
  url text,
  hours text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.support_resources enable row level security;
revoke all on public.support_resources from anon, authenticated;
grant select on public.support_resources to authenticated;

-- Lecture seule côté app. Rien n'est enregistré sur qui consulte (F-HELP-04).
create policy support_resources_select on public.support_resources
  for select to authenticated
  using (school_id is null or school_id = private.current_school_id());

-- Ressources nationales (F-HELP-02). NUMÉROS ET LIENS À VÉRIFIER AVANT LA MISE EN PRODUCTION.
insert into public.support_resources (school_id, name, description, phone, url, hours, sort_order) values
  (null, '3114 — Prévention du suicide', 'Écoute par des professionnels de santé, pour soi ou pour un proche. Appel gratuit et confidentiel.', '3114', 'https://3114.fr', '24h/24, 7j/7', 10),
  (null, 'Fil Santé Jeunes', 'Écoute anonyme et gratuite pour les 12-25 ans : mal-être, santé, vie affective.', '0800235236', 'https://www.filsantejeunes.com', 'Tous les jours, 9h-23h', 20),
  (null, 'Santé Psy Étudiant', 'Des séances gratuites avec un psychologue, sans avance de frais, pour tous les étudiants.', null, 'https://santepsy.etudiant.gouv.fr', null, 30),
  (null, 'Nightline', 'Des étudiants formés à l''écoute, pour parler de tout, la nuit, par téléphone ou par tchat.', null, 'https://www.nightline.fr', 'Le soir et la nuit', 40);

-- MINI-SONDAGE D'INTÉGRATION (F-SURV) -----------------------------------------------------

create table public.integration_surveys (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  user_id uuid not null references public.profiles (id),
  wave text not null check (wave in ('signup', 'd60')),
  -- null = « Passer » : on retient seulement qu'il ne faut plus reposer la question.
  score smallint check (score between 1 and 10),
  -- Formation et année au moment de la réponse, pour les statistiques agrégées.
  program text,
  study_year smallint,
  created_at timestamptz not null default now(),
  unique (user_id, wave)
);

alter table public.integration_surveys enable row level security;
revoke all on public.integration_surveys from anon, authenticated;
grant select on public.integration_surveys to authenticated;

-- Chacun ne relit que ses propres réponses. L'école n'y accède qu'en agrégé (F-SURV-02, lot 6).
create policy integration_surveys_select_own on public.integration_surveys
  for select to authenticated using (user_id = auth.uid());

create function public.submit_integration_survey(p_wave text, p_score int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid() and status = 'active';
  if not found then
    raise exception 'not_authenticated';
  end if;
  -- La vague « J+60 » ne s'ouvre que 60 jours après l'inscription.
  if p_wave = 'd60' and v_profile.created_at > now() - interval '60 days' then
    raise exception 'survey_too_early';
  end if;
  insert into public.integration_surveys (school_id, user_id, wave, score, program, study_year)
  values (v_profile.school_id, v_profile.id, p_wave, p_score, v_profile.program, v_profile.study_year)
  on conflict (user_id, wave) do nothing;
end;
$$;

revoke all on function public.submit_integration_survey(text, int) from public, anon;
grant execute on function public.submit_integration_survey(text, int) to authenticated;

-- SUPPRESSION DE COMPTE : prise en compte du lot 5 ---------------------------------------
-- Un trigger plutôt qu'une nouvelle version de delete_my_account : dès qu'un profil passe à « deleted »,
-- ses parrainages se terminent et ses réponses au sondage sont effacées.

create function private.profiles_after_delete_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.mentorships set status = 'ended', ended_at = now()
    where status <> 'ended' and new.id in (mentee_id, mentor_id);
  delete from public.integration_surveys where user_id = new.id;
  perform private.assign_waiting_mentees(new.school_id);
  return new;
end;
$$;

create trigger profiles_after_delete_status
  after update of status on public.profiles
  for each row when (new.status = 'deleted' and old.status <> 'deleted')
  execute function private.profiles_after_delete_status();
