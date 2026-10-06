import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDb, createStudent, queryAs } from './helpers';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
// Filleuls (1re année), parrains (2e année et plus), et un étudiant d'une autre école.
const [LUCAS, LEA, NOE, MARC, INES, TOM, DEMO] = [id(1), id(2), id(3), id(4), id(5), id(6), id(7)];

let db: PGlite;

beforeAll(async () => {
  db = await createDb();
  await createStudent(db, LUCAS, 'esta-belfort', 'Lucas', { study_year: 1, program: 'Cycle Bachelor', interests: ['sport', 'games'], is_newcomer: true });
  await createStudent(db, LEA, 'esta-belfort', 'Lea', { study_year: 1, program: 'Cycle Bachelor' });
  await createStudent(db, NOE, 'esta-belfort', 'Noe', { study_year: 1, program: 'Cycle Bachelor' });
  await createStudent(db, MARC, 'esta-belfort', 'Marc', { study_year: 4, program: 'Cycle Master', interests: ['sport', 'games'] });
  await createStudent(db, INES, 'esta-belfort', 'Ines', { study_year: 2, program: 'Cycle Bachelor' });
  await createStudent(db, TOM, 'esta-belfort', 'Tom', { study_year: 3, program: 'Cycle Bachelor' });
  await createStudent(db, DEMO, 'demo', 'Demo', { study_year: 3 });
});

const volunteer = (as: string, capacity: number) => queryAs(db, as, `select public.set_mentor_status($1)`, [capacity]);
const request = async (as: string) => (await queryAs(db, as, `select public.request_mentor() as status`)).rows[0].status;
const respond = (as: string, mentorshipId: string, accept: boolean) =>
  queryAs(db, as, `select public.respond_mentorship($1, $2)`, [mentorshipId, accept]);
const end = (as: string, mentorshipId: string) => queryAs(db, as, `select public.end_mentorship($1)`, [mentorshipId]);
const requestOf = async (mentee: string) =>
  (await db.query<{ id: string; status: string; mentor_id: string | null }>(
    `select id, status, mentor_id from public.mentorships where mentee_id = $1 and status <> 'ended'`, [mentee])).rows[0];
const notificationsOf = async (userId: string) =>
  (await db.query<{ type: string }>(`select type from public.notifications where user_id = $1`, [userId])).rows.map((r) => r.type);

describe('devenir parrain (F-MENT-02)', () => {
  it('réservé aux 2e année et plus, avec 1 à 3 filleuls', async () => {
    await expect(volunteer(LUCAS, 1)).rejects.toThrow(/mentor_first_year/);
    await expect(volunteer(MARC, 4)).rejects.toThrow(/mentor_capacity_invalid/);
    // Le statut de parrain ne se donne pas en modifiant son profil directement.
    await expect(queryAs(db, LUCAS, `update public.profiles set is_mentor = true where id = $1`, [LUCAS])).rejects.toThrow(/permission denied/);
  });
});

describe("file d'attente et attribution (F-MENT-03 à 05)", () => {
  it("sans parrain disponible, la demande attend ; elle est servie dès qu'un volontaire arrive", async () => {
    expect(await request(LUCAS)).toBe('requested');
    await expect(request(LUCAS)).rejects.toThrow(/mentorship_exists/);

    await volunteer(INES, 1);
    expect(await requestOf(LUCAS)).toMatchObject({ status: 'proposed', mentor_id: INES });
    expect(await notificationsOf(INES)).toContain('mentorship_proposed');
  });

  it('choisit le parrain de la même formation plutôt que celui qui partage des centres d’intérêt', async () => {
    // Marc partage 2 centres d'intérêt avec Lucas (score 2) ; Tom est dans la même formation (score 3).
    await volunteer(MARC, 2);
    await volunteer(TOM, 2);
    const mentorship = await requestOf(LUCAS);
    await respond(INES, mentorship.id, false);
    expect(await requestOf(LUCAS)).toMatchObject({ status: 'proposed', mentor_id: TOM });
  });

  it('un refus passe au suivant, et on ne repropose jamais à celui qui a refusé', async () => {
    const mentorship = await requestOf(LUCAS);
    await respond(TOM, mentorship.id, false);
    expect(await requestOf(LUCAS)).toMatchObject({ status: 'proposed', mentor_id: MARC });
    await expect(respond(TOM, mentorship.id, true)).rejects.toThrow(/mentorship_not_found/);
  });

  it('sans réponse sous 72 h, la demande passe au suivant (ici : plus personne, retour en file)', async () => {
    const mentorship = await requestOf(LUCAS);
    await db.query(`update public.mentorships set proposed_at = now() - interval '73 hours' where id = $1`, [mentorship.id]);
    await db.query(`select private.expire_mentorship_proposals()`);
    expect(await requestOf(LUCAS)).toMatchObject({ status: 'requested', mentor_id: null });
    // Marc ne peut plus répondre : sa proposition a expiré.
    await expect(respond(MARC, mentorship.id, true)).rejects.toThrow(/mentorship_not_found/);
  });

  it("respecte la capacité : un parrain à 1 filleul n'en reçoit pas deux", async () => {
    await end(LUCAS, (await requestOf(LUCAS)).id);
    expect(await request(LEA)).toBe('proposed');
    const first = await requestOf(LEA);
    expect(await request(NOE)).toBe('proposed');
    const second = await requestOf(NOE);
    expect(first.mentor_id).not.toBe(second.mentor_id); // Inès (1 place) ne peut pas avoir les deux
    const load = await db.query<{ mentor_id: string; n: number }>(
      `select mentor_id, count(*)::int as n from public.mentorships where status in ('proposed', 'active') group by mentor_id`);
    for (const row of load.rows) {
      const capacity = (await db.query<{ mentor_capacity: number }>(`select mentor_capacity from public.profiles where id = $1`, [row.mentor_id])).rows[0].mentor_capacity;
      expect(row.n).toBeLessThanOrEqual(capacity);
    }
  });
});

describe('acceptation (F-MENT-06) et fin (F-MENT-07)', () => {
  let mentorshipId: string;
  let mentor: string;

  it("ouvre la conversation avec un message d'accueil, crédite les points et le badge du parrain", async () => {
    const mentorship = await requestOf(LEA);
    mentorshipId = mentorship.id;
    mentor = mentorship.mentor_id!;
    // Seul le parrain sollicité peut répondre.
    await expect(respond(LEA, mentorshipId, true)).rejects.toThrow(/mentorship_not_found/);
    await respond(mentor, mentorshipId, true);

    expect(await requestOf(LEA)).toMatchObject({ status: 'active', mentor_id: mentor });
    const messages = (await queryAs(db, LEA, `select content, sender_id from public.messages`)).rows;
    expect(messages).toHaveLength(1);
    expect(messages[0].sender_id).toBe(mentor);
    expect(messages[0].content).toMatch(/^Salut Lea ! Je suis .*, ton parrain/);

    const profile = (await db.query<{ points_balance: number }>(`select points_balance from public.profiles where id = $1`, [mentor])).rows[0];
    expect(profile.points_balance).toBe(10);
    expect((await db.query(`select 1 from public.user_badges where user_id = $1 and badge_code = 'mentor'`, [mentor])).rows).toHaveLength(1);
    expect(await notificationsOf(LEA)).toContain('mentorship_accepted');
  });

  it('un parrainage ne se lit que par le parrain et le filleul', async () => {
    expect((await queryAs(db, LEA, `select id from public.mentorships`)).rows).toEqual([{ id: mentorshipId }]);
    // Lucas ne voit que sa propre demande (terminée), pas le parrainage de Léa.
    expect((await queryAs(db, LUCAS, `select id from public.mentorships where id = $1`, [mentorshipId])).rows).toEqual([]);
    expect((await queryAs(db, DEMO, `select id from public.mentorships`)).rows).toEqual([]);
    await expect(queryAs(db, LEA, `update public.mentorships set status = 'ended'`)).rejects.toThrow(/permission denied/);
  });

  it('parrain et filleul présents à la même activité : +15 chacun, une seule fois dans le mois', async () => {
    const balance = async (userId: string) =>
      (await db.query<{ points_balance: number }>(`select points_balance from public.profiles where id = $1`, [userId])).rows[0].points_balance;
    const together = async (title: string) => {
      const activityId = (await queryAs(db, mentor, `insert into public.activities (title, category, starts_at, location_name, lat, lng)
        values ($1, 'sport', now() + interval '2 days', 'Stade', 47.64, 6.85) returning id`, [title])).rows[0].id as string;
      await queryAs(db, LEA, `select public.join_activity($1)`, [activityId]);
      await db.query(`alter table public.activities disable trigger user`);
      await db.query(`update public.activities set starts_at = now() - interval '10 minutes', ends_at = now() + interval '1 hour' where id = $1`, [activityId]);
      await db.query(`alter table public.activities enable trigger user`);
      await queryAs(db, mentor, `select public.manual_checkin($1, $2)`, [activityId, LEA]);
    };
    const pairPoints = async (userId: string) =>
      (await db.query(`select 1 from public.point_transactions where user_id = $1 and reason = 'mentor_pair_attendance'`, [userId])).rows.length;

    const before = await balance(LEA);
    await together('Footing du binôme');
    // Léa : 10 (présence) + 15 (première activité) + 5 (nouvelle catégorie) + 15 (binôme).
    expect(await balance(LEA)).toBe(before + 45);
    expect(await pairPoints(mentor)).toBe(1);

    await together('Deuxième footing');
    expect(await pairPoints(LEA)).toBe(1);
    expect(await pairPoints(mentor)).toBe(1);
  });

  it("chacun peut y mettre fin ; la place libérée sert la file d'attente", async () => {
    // Tous les parrains sont pris ou ont refusé Lucas : sa nouvelle demande part d'une liste de refus vide.
    await volunteer(MARC, 0);
    await volunteer(TOM, 0);
    const other = await requestOf(NOE);
    if (other.status === 'proposed') await respond(other.mentor_id!, other.id, true);
    await volunteer(INES, 1);
    await db.query(`update public.profiles set mentor_capacity = 1 where id = $1`, [mentor]);
    expect(await request(LUCAS)).toBe('requested');

    await end(mentor, mentorshipId);
    expect(await notificationsOf(LEA)).toContain('mentorship_ended');
    expect(await requestOf(LEA)).toBeUndefined();
    expect(await requestOf(LUCAS)).toMatchObject({ status: 'proposed', mentor_id: mentor });
    await expect(end(TOM, (await requestOf(LUCAS)).id)).rejects.toThrow(/mentorship_not_found/);
  });

  it('se désactive par école (F-MENT-01)', async () => {
    await db.query(`update public.schools set settings = settings || '{"mentoring_enabled": false}' where slug = 'demo'`);
    await expect(request(DEMO)).rejects.toThrow(/mentoring_disabled/);
    await expect(volunteer(DEMO, 1)).rejects.toThrow(/mentoring_disabled/);
  });

  it('supprimer son compte termine ses parrainages', async () => {
    await queryAs(db, LUCAS, `select public.delete_my_account()`);
    expect((await db.query(`select 1 from public.mentorships where mentee_id = $1 and status <> 'ended'`, [LUCAS])).rows).toEqual([]);
  });
});

describe('« Besoin de parler » (F-HELP)', () => {
  it("montre les ressources nationales et celles de son école, pas celles d'une autre", async () => {
    await db.query(`insert into public.support_resources (school_id, name, phone)
                    select id, 'Cellule d''écoute ESTA', '0384000000' from public.schools where slug = 'esta-belfort'`);
    const names = async (as: string) => (await queryAs(db, as, `select name from public.support_resources order by sort_order`)).rows.map((r) => r.name);
    expect(await names(LEA)).toContain("Cellule d'écoute ESTA");
    expect(await names(LEA)).toContain('3114 — Prévention du suicide');
    expect(await names(DEMO)).not.toContain("Cellule d'écoute ESTA");
    expect(await names(DEMO)).toHaveLength(4);
    await expect(queryAs(db, LEA, `delete from public.support_resources`)).rejects.toThrow(/permission denied/);
  });
});

describe("sondage d'intégration (F-SURV)", () => {
  const submit = (as: string, wave: string, score: number | null) =>
    queryAs(db, as, `select public.submit_integration_survey($1, $2)`, [wave, score]);

  it('enregistre une réponse par vague, avec la formation du moment ; « Passer » compte comme répondu', async () => {
    await submit(LEA, 'signup', 7);
    await submit(LEA, 'signup', 2); // ignoré : déjà répondu
    await submit(NOE, 'signup', null);
    const rows = (await db.query<Record<string, unknown>>(`select user_id, score, program from public.integration_surveys order by created_at`)).rows;
    expect(rows).toEqual([
      { user_id: LEA, score: 7, program: 'Cycle Bachelor' },
      { user_id: NOE, score: null, program: 'Cycle Bachelor' },
    ]);
  });

  it("refuse une note hors de 1 à 10, et la vague J+60 avant 60 jours d'ancienneté", async () => {
    await expect(submit(TOM, 'signup', 11)).rejects.toThrow(/check/);
    await expect(submit(TOM, 'd60', 8)).rejects.toThrow(/survey_too_early/);
    await db.query(`update public.profiles set created_at = now() - interval '61 days' where id = $1`, [TOM]);
    await submit(TOM, 'd60', 8);
  });

  it('chacun ne relit que ses propres réponses', async () => {
    expect((await queryAs(db, LEA, `select score from public.integration_surveys`)).rows).toEqual([{ score: 7 }]);
    expect((await queryAs(db, MARC, `select 1 from public.integration_surveys`)).rows).toEqual([]);
  });
});
