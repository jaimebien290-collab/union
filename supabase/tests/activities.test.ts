import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDb, createStudent, queryAs } from './helpers';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const [LUCAS, INES, MARC, ZOE, DEMO] = [id(1), id(2), id(3), id(4), id(5)];

let db: PGlite;

beforeAll(async () => {
  db = await createDb();
  await createStudent(db, LUCAS, 'esta-belfort', 'Lucas');
  await createStudent(db, INES, 'esta-belfort', 'Ines');
  await createStudent(db, MARC, 'esta-belfort', 'Marc', { role: 'ambassador' });
  await createStudent(db, ZOE, 'esta-belfort', 'Zoe');
  await createStudent(db, DEMO, 'demo', 'Demo');
});

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function createActivity(as: string, overrides: Record<string, unknown> = {}) {
  const cols: Record<string, unknown> = {
    title: 'Foot du jeudi',
    category: 'sport',
    starts_at: inDays(2),
    location_name: 'Stade Serzian',
    lat: 47.64,
    lng: 6.85,
    ...overrides,
  };
  const names = Object.keys(cols);
  const { rows } = await queryAs(
    db,
    as,
    `insert into public.activities (${names.join(', ')}) values (${names.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
    Object.values(cols),
  );
  return rows[0] as Record<string, any>;
}

const join = (as: string, activityId: string) =>
  queryAs(db, as, `select public.join_activity($1) as status`, [activityId]).then((r) => r.rows[0].status);
const leave = (as: string, activityId: string) => queryAs(db, as, `select public.leave_activity($1)`, [activityId]);
const statusOf = async (userId: string, activityId: string) =>
  (await db.query<{ status: string }>(`select status from public.activity_participants where activity_id = $1 and user_id = $2`, [activityId, userId])).rows[0]?.status;
const notificationsOf = async (userId: string) =>
  (await db.query<{ type: string }>(`select type from public.notifications where user_id = $1 order by created_at`, [userId])).rows.map((r) => r.type);

describe('création (F-ACT-01, 02, 05)', () => {
  it("fixe l'auteur, l'école et la fin par défaut, et inscrit l'organisateur", async () => {
    const activity = await createActivity(LUCAS);
    expect(activity.creator_id).toBe(LUCAS);
    expect(activity.status).toBe('published');
    expect(new Date(activity.ends_at).getTime() - new Date(activity.starts_at).getTime()).toBe(2 * 3_600_000);
    expect(await statusOf(LUCAS, activity.id)).toBe('registered');
  });

  it("ne laisse pas choisir l'auteur ou l'école", async () => {
    await expect(createActivity(LUCAS, { creator_id: INES })).rejects.toThrow(/permission denied/);
  });

  it.each([
    ['dans 10 minutes', new Date(Date.now() + 10 * 60_000).toISOString()],
    ['dans 7 mois', inDays(215)],
  ])('refuse un début %s', async (_label, startsAt) => {
    await expect(createActivity(LUCAS, { starts_at: startsAt })).rejects.toThrow(/start_out_of_range/);
  });

  it('refuse un titre trop court, une catégorie inconnue, moins de 2 places', async () => {
    await expect(createActivity(LUCAS, { title: 'Foot' })).rejects.toThrow(/check/);
    await expect(createActivity(LUCAS, { category: 'poney' })).rejects.toThrow(/check/);
    await expect(createActivity(LUCAS, { max_participants: 1 })).rejects.toThrow(/check/);
  });

  it('réserve le badge officiel aux ambassadeurs', async () => {
    await expect(createActivity(LUCAS, { is_official: true })).rejects.toThrow(/official_not_allowed/);
    expect((await createActivity(MARC, { is_official: true, title: 'Soirée BDE' })).is_official).toBe(true);
  });

  it('limite à 10 créations par jour (NF-SEC-04)', async () => {
    for (let i = 0; i < 10; i++) await createActivity(ZOE, { title: `Activité ${i}` });
    await expect(createActivity(ZOE)).rejects.toThrow(/too_many_activities/);
  });
});

describe('cloisonnement par école', () => {
  it("une autre école ne voit ni les activités ni les inscriptions, et ne peut pas s'inscrire", async () => {
    const activity = await createActivity(LUCAS);
    for (const table of ['activities', 'activity_cards', 'activity_participants']) {
      expect((await queryAs(db, DEMO, `select * from public.${table}`)).rows).toEqual([]);
    }
    await expect(join(DEMO, activity.id)).rejects.toThrow(/activity_not_found/);
  });

  it("les inscriptions ne s'écrivent pas directement", async () => {
    const activity = await createActivity(LUCAS);
    await expect(
      queryAs(db, INES, `insert into public.activity_participants (activity_id, user_id, school_id, status)
                         select $1, $2, school_id, 'registered' from public.profiles where id = $2`, [activity.id, INES]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      queryAs(db, INES, `update public.activity_participants set checked_in_at = now() where activity_id = $1`, [activity.id]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("inscription et liste d'attente (F-ACT-06, 07)", () => {
  it("inscrit tant qu'il reste des places, puis met en attente et promeut au premier désistement", async () => {
    const activity = await createActivity(LUCAS, { max_participants: 2 });
    expect(await join(INES, activity.id)).toBe('registered');
    expect(await join(MARC, activity.id)).toBe('waitlisted');
    expect(await join(ZOE, activity.id)).toBe('waitlisted');

    const card = (await queryAs(db, MARC, `select registered_count, spots_left, my_status from public.activity_cards where id = $1`, [activity.id])).rows[0];
    expect(card).toEqual({ registered_count: 2, spots_left: 0, my_status: 'waitlisted' });

    await leave(INES, activity.id);
    expect(await statusOf(INES, activity.id)).toBe('cancelled');
    expect(await statusOf(MARC, activity.id)).toBe('registered'); // premier arrivé, premier promu
    expect(await statusOf(ZOE, activity.id)).toBe('waitlisted');
    expect(await notificationsOf(MARC)).toContain('waitlist_promoted');
  });

  it("s'inscrire deux fois ne change rien, et on peut revenir après s'être désinscrit", async () => {
    const activity = await createActivity(LUCAS);
    expect(await join(INES, activity.id)).toBe('registered');
    expect(await join(INES, activity.id)).toBe('registered');
    await leave(INES, activity.id);
    expect(await join(INES, activity.id)).toBe('registered');
    const { rows } = await db.query(`select 1 from public.activity_participants where activity_id = $1`, [activity.id]);
    expect(rows).toHaveLength(2);
  });

  it("l'organisateur ne peut pas se désinscrire", async () => {
    const activity = await createActivity(LUCAS);
    await expect(leave(LUCAS, activity.id)).rejects.toThrow(/organizer_cannot_leave/);
  });

  it("on ne s'inscrit ni ne se désinscrit d'une activité commencée", async () => {
    const activity = await createActivity(LUCAS);
    await join(INES, activity.id);
    await db.query(`alter table public.activities disable trigger user`);
    await db.query(`update public.activities set starts_at = now() - interval '1 hour', ends_at = now() + interval '1 hour' where id = $1`, [activity.id]);
    await db.query(`alter table public.activities enable trigger user`);
    await expect(join(MARC, activity.id)).rejects.toThrow(/activity_started/);
    await expect(leave(INES, activity.id)).rejects.toThrow(/activity_started/);
  });
});

describe('modification et annulation (F-ACT-09)', () => {
  it("seul l'organisateur modifie ; un changement de date prévient les inscrits", async () => {
    const activity = await createActivity(LUCAS, { title: 'Escalade débutants' });
    await join(INES, activity.id);
    const update = `update public.activities set starts_at = $2, ends_at = $3 where id = $1`;
    expect((await queryAs(db, INES, update, [activity.id, inDays(3), inDays(3.1)])).affected).toBe(0);
    expect((await queryAs(db, LUCAS, update, [activity.id, inDays(3), inDays(3.1)])).affected).toBe(1);
    expect(await notificationsOf(INES)).toContain('activity_updated');
    expect(await notificationsOf(LUCAS)).not.toContain('activity_updated');
  });

  it('augmenter le nombre de places promeut la liste d’attente ; on ne descend pas sous le nombre d’inscrits', async () => {
    const activity = await createActivity(LUCAS, { max_participants: 2 });
    await join(INES, activity.id);
    await join(ZOE, activity.id);
    const update = `update public.activities set max_participants = $2 where id = $1`;
    await queryAs(db, LUCAS, update, [activity.id, 3]);
    expect(await statusOf(ZOE, activity.id)).toBe('registered');
    await expect(queryAs(db, LUCAS, update, [activity.id, 2])).rejects.toThrow(/capacity_below_registered/);
  });

  it("le statut ne se modifie pas directement ; l'annulation passe par cancel_activity et prévient les inscrits", async () => {
    const activity = await createActivity(LUCAS, { title: 'Soirée jeux' });
    await join(INES, activity.id);
    await expect(queryAs(db, LUCAS, `update public.activities set status = 'hidden' where id = $1`, [activity.id])).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, INES, `select public.cancel_activity($1)`, [activity.id])).rejects.toThrow(/activity_not_found/);

    await queryAs(db, LUCAS, `select public.cancel_activity($1)`, [activity.id]);
    const before = (await notificationsOf(INES)).filter((t) => t === 'activity_cancelled').length;
    expect(before).toBeGreaterThan(0);
    await expect(join(ZOE, activity.id)).rejects.toThrow(/activity_not_found/);
    await expect(queryAs(db, LUCAS, `update public.activities set title = 'Réouverte' where id = $1`, [activity.id])).rejects.toThrow(/activity_locked/);
  });
});

describe('photos de couverture', () => {
  it("se déposent dans le dossier de son école et de son compte, et se lisent dans l'école seulement", async () => {
    const school = (await db.query<{ school_id: string }>(`select school_id from public.profiles where id = $1`, [LUCAS])).rows[0].school_id;
    const insert = (as: string, path: string) =>
      queryAs(db, as, `insert into storage.objects (bucket_id, name) values ('covers', $1)`, [path]);
    await insert(LUCAS, `${school}/${LUCAS}/a.jpg`);
    await expect(insert(INES, `${school}/${LUCAS}/b.jpg`)).rejects.toThrow(/row-level security/);
    await expect(insert(DEMO, `${school}/${DEMO}/c.jpg`)).rejects.toThrow(/row-level security/);

    const select = `select name from storage.objects where bucket_id = 'covers'`;
    expect((await queryAs(db, INES, select)).rows).toHaveLength(1);
    expect((await queryAs(db, DEMO, select)).rows).toEqual([]);

    await expect(createActivity(INES, { cover_url: `${school}/${LUCAS}/a.jpg` })).rejects.toThrow(/activities_cover_path/);
  });
});

describe('suppression de compte', () => {
  it('annule mes activités à venir et libère mes places', async () => {
    // Les tests précédents ont consommé le quota quotidien de créations de Lucas.
    await db.query(`alter table public.activities disable trigger user`);
    await db.query(`update public.activities set created_at = now() - interval '2 days'`);
    await db.query(`alter table public.activities enable trigger user`);
    const mine = await createActivity(INES, { title: 'Sortie ciné' });
    await join(LUCAS, mine.id);
    const other = await createActivity(LUCAS, { max_participants: 2, title: 'Tennis en double' });
    await join(INES, other.id);
    await join(MARC, other.id);
    expect(await statusOf(MARC, other.id)).toBe('waitlisted');

    await queryAs(db, INES, `select public.delete_my_account()`);

    expect((await db.query<{ status: string }>(`select status from public.activities where id = $1`, [mine.id])).rows[0].status).toBe('cancelled');
    expect(await notificationsOf(LUCAS)).toContain('activity_cancelled');
    expect(await statusOf(INES, other.id)).toBe('cancelled');
    expect(await statusOf(MARC, other.id)).toBe('registered');
  });
});
