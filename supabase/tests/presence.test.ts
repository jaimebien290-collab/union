import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDb, createStudent, queryAs } from './helpers';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const [LUCAS, INES, MARC, ZOE, TOM, LEA, DEMO] = [id(1), id(2), id(3), id(4), id(5), id(6), id(7)];

let db: PGlite;

beforeAll(async () => {
  db = await createDb();
  await createStudent(db, LUCAS, 'esta-belfort', 'Lucas', { interests: ['games'] });
  await createStudent(db, INES, 'esta-belfort', 'Ines');
  await createStudent(db, MARC, 'esta-belfort', 'Marc', { role: 'ambassador' });
  await createStudent(db, ZOE, 'esta-belfort', 'Zoe');
  await createStudent(db, TOM, 'esta-belfort', 'Tom');
  await createStudent(db, LEA, 'esta-belfort', 'Lea');
  await createStudent(db, DEMO, 'demo', 'Demo');
});

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/** Crée une activité, y inscrit `members`, puis la déplace pour qu'elle soit en cours (check-in ouvert). */
async function runningActivity(creator: string, members: string[], category = 'sport', title = 'Foot du jeudi') {
  const { rows } = await queryAs(
    db,
    creator,
    `insert into public.activities (title, category, starts_at, location_name, lat, lng)
     values ($1, $2, $3, 'Stade', 47.64, 6.85) returning id`,
    [title, category, inDays(2)],
  );
  const activityId = rows[0].id as string;
  for (const member of members) await queryAs(db, member, `select public.join_activity($1)`, [activityId]);
  await shift(activityId, `now() - interval '10 minutes'`, `now() + interval '2 hours'`);
  return activityId;
}

async function shift(activityId: string, startsAt: string, endsAt: string) {
  await db.query(`alter table public.activities disable trigger user`);
  await db.query(`update public.activities set starts_at = ${startsAt}, ends_at = ${endsAt}, created_at = now() - interval '2 days' where id = $1`, [activityId]);
  await db.query(`alter table public.activities enable trigger user`);
}

const token = async (as: string, activityId: string) =>
  ((await queryAs(db, as, `select public.get_checkin_token($1) as t`, [activityId])).rows[0].t as { token: string; expires_in: number }).token;
const checkin = async (as: string, t: string) =>
  (await queryAs(db, as, `select public.checkin($1) as r`, [t])).rows[0].r as { status: string; points: number; badges: string[] };
const balance = async (userId: string) =>
  (await db.query<{ points_balance: number }>(`select points_balance from public.profiles where id = $1`, [userId])).rows[0].points_balance;
const isPresent = async (userId: string, activityId: string) =>
  (await db.query<{ ok: boolean }>(`select checked_in_at is not null as ok from public.activity_participants where activity_id = $1 and user_id = $2`, [activityId, userId])).rows[0].ok;
/** Efface les points du jour : le plafond quotidien ne doit pas fausser les tests suivants. */
const forgetToday = () => db.query(`update public.point_transactions set created_at = created_at - interval '2 days'`);

describe('check-in par QR (F-ACT-10, NF-SEC-03)', () => {
  let activityId: string;
  let qr: string;

  beforeAll(async () => {
    activityId = await runningActivity(LUCAS, [INES, ZOE]);
    qr = await token(LUCAS, activityId);
  });

  it("seul l'organisateur (ou un ambassadeur) obtient le QR", async () => {
    await expect(token(INES, activityId)).rejects.toThrow(/activity_not_found/);
    await expect(token(DEMO, activityId)).rejects.toThrow(/activity_not_found/);
    expect(await token(MARC, activityId)).toBe(qr);
    expect(qr.split('.')).toHaveLength(3);
  });

  it('valide la présence : +10, +15 de première activité, +5 de nouvelle catégorie, badge Premier pas', async () => {
    const result = await checkin(INES, qr);
    expect(result).toEqual({ status: 'ok', points: 30, badges: ['first_step'] });
    expect(await balance(INES)).toBe(30);
    expect(await isPresent(INES, activityId)).toBe(true);
    const notifications = await db.query(`select 1 from public.notifications where user_id = $1 and type = 'badge_unlocked'`, [INES]);
    expect(notifications.rows).toHaveLength(1);
  });

  it("valide du même coup la présence de l'organisateur, et crée la rencontre", async () => {
    expect(await isPresent(LUCAS, activityId)).toBe(true);
    expect(await balance(LUCAS)).toBe(30);
    const { rows } = await queryAs(db, INES, `select first_name, shared_count, last_activity_title from public.my_encounters`);
    expect(rows).toEqual([{ first_name: 'Lucas', shared_count: 1, last_activity_title: 'Foot du jeudi' }]);
  });

  it('un second scan ne rapporte rien', async () => {
    expect(await checkin(INES, qr)).toMatchObject({ status: 'already', points: 0 });
    expect(await balance(INES)).toBe(30);
  });

  it('refuse un jeton falsifié, périmé, ou présenté par un non-inscrit', async () => {
    const [activity, window, signature] = qr.split('.');
    await expect(checkin(ZOE, `${activity}.${window}.${'0'.repeat(64)}`)).rejects.toThrow(/checkin_invalid/);
    await expect(checkin(ZOE, `${activity}.${Number(window) + 1}.${signature}`)).rejects.toThrow(/checkin_invalid/);
    await expect(checkin(ZOE, 'nimporte quoi')).rejects.toThrow(/checkin_invalid/);
    await expect(checkin(TOM, qr)).rejects.toThrow(/checkin_not_registered/);
    await expect(checkin(DEMO, qr)).rejects.toThrow(/checkin_invalid/);

    // Un vrai jeton, mais vieux de 5 minutes (capture d'écran partagée).
    const old = Number(window) - 5;
    const oldSignature = (await db.query<{ s: string }>(`select private.checkin_signature($1, $2) as s`, [activity, old])).rows[0].s;
    await expect(checkin(ZOE, `${activity}.${old}.${oldSignature}`)).rejects.toThrow(/checkin_expired/);
  });

  it("n'est ouvert que de 30 min avant le début à 2 h après la fin", async () => {
    await shift(activityId, `now() + interval '45 minutes'`, `now() + interval '3 hours'`);
    await expect(token(LUCAS, activityId)).rejects.toThrow(/checkin_closed/);
    await expect(checkin(ZOE, qr)).rejects.toThrow(/checkin_closed/);
    await shift(activityId, `now() + interval '20 minutes'`, `now() + interval '3 hours'`);
    expect((await checkin(ZOE, qr)).status).toBe('ok');
    await shift(activityId, `now() - interval '5 hours'`, `now() - interval '3 hours'`);
    await expect(token(LUCAS, activityId)).rejects.toThrow(/checkin_closed/);
  });

  it('le secret et les fonctions internes ne sont pas accessibles', async () => {
    await expect(queryAs(db, LUCAS, `select * from private.activity_secrets`)).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, LUCAS, `select private.checkin_signature($1, 1)`, [activityId])).rejects.toThrow(/permission denied/);
    await expect(
      queryAs(db, LUCAS, `select private.add_points($1, (select school_id from public.profiles where id = $1), 'attendance', 'x', null, 1000)`, [LUCAS]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('pointage manuel', () => {
  it("l'organisateur coche un inscrit présent ; pas lui-même, pas un non-inscrit ; un simple participant ne coche personne", async () => {
    await forgetToday();
    const activityId = await runningActivity(TOM, [LEA, ZOE], 'games', 'Soirée jeux');
    const manual = (as: string, user: string) => queryAs(db, as, `select public.manual_checkin($1, $2) as r`, [activityId, user]);

    await expect(manual(LEA, ZOE)).rejects.toThrow(/activity_not_found/);
    await expect(manual(TOM, TOM)).rejects.toThrow(/checkin_not_registered/);
    await expect(manual(TOM, INES)).rejects.toThrow(/checkin_not_registered/);
    expect((await manual(TOM, LEA)).rows[0].r).toMatchObject({ status: 'ok' });
    expect(await isPresent(LEA, activityId)).toBe(true);
    expect(await isPresent(TOM, activityId)).toBe(true);
    const method = await db.query<{ checkin_method: string }>(`select checkin_method from public.activity_participants where activity_id = $1 and user_id = $2`, [activityId, LEA]);
    expect(method.rows[0].checkin_method).toBe('manual');
  });
});

describe('barème (§6.9)', () => {
  it("même catégorie une seconde fois : seulement les 10 points de présence ; l'organisateur gagne 20 à partir de 3 présents", async () => {
    await forgetToday();
    const before = { ines: await balance(INES), lucas: await balance(LUCAS) };
    const activityId = await runningActivity(LUCAS, [INES, ZOE, TOM], 'sport', 'Foot bis');
    const qr = await token(LUCAS, activityId);

    expect((await checkin(INES, qr)).points).toBe(10);
    await checkin(ZOE, qr);
    expect(await balance(LUCAS)).toBe(before.lucas + 10); // présence seule, pas encore 3 participants
    await checkin(TOM, qr);
    expect(await balance(LUCAS)).toBe(before.lucas + 30);
    expect(await balance(INES)).toBe(before.ines + 10);

    const shared = (await queryAs(db, INES, `select shared_count from public.my_encounters where first_name = 'Lucas'`)).rows[0].shared_count;
    expect(shared).toBe(2);
  });

  it('plafonne à 60 points par jour, sans perdre la trace des présences', async () => {
    await forgetToday();
    const start = await balance(MARC);
    for (const [index, category] of ['sport', 'outings', 'parties', 'travel', 'culture'].entries()) {
      const activityId = await runningActivity(LUCAS, [MARC], category, `Activité plafond ${index}`);
      await checkin(MARC, await token(LUCAS, activityId));
    }
    // 30 (10 + 15 + 5) puis 15, 15 = 60 ; les deux dernières ne rapportent plus rien.
    expect(await balance(MARC)).toBe(start + 60);
    const count = await db.query(`select 1 from public.point_transactions where user_id = $1 and reason = 'attendance'`, [MARC]);
    expect(count.rows).toHaveLength(5);
    // 5 catégories différentes : badge Explorateur.
    expect((await db.query<{ badge_code: string }>(`select badge_code from public.user_badges where user_id = $1`, [MARC])).rows.map((r) => r.badge_code)).toEqual(
      expect.arrayContaining(['first_step', 'explorer']),
    );
  });

  it("applique le barème propre à l'école s'il est défini", async () => {
    await forgetToday();
    await db.query(`update public.schools set settings = settings || '{"points": {"attendance": 25}}' where slug = 'esta-belfort'`);
    const before = await balance(LEA);
    const activityId = await runningActivity(LUCAS, [LEA], 'games', 'Jeux de société');
    await checkin(LEA, await token(LUCAS, activityId));
    expect(await balance(LEA)).toBe(before + 25);
    await db.query(`update public.schools set settings = settings - 'points' where slug = 'esta-belfort'`);
  });
});

describe('confidentialité et profil public', () => {
  it('mes points et mes rencontres ne sont lisibles que par moi ; rien ne s’écrit directement', async () => {
    expect((await queryAs(db, INES, `select distinct user_id from public.point_transactions`)).rows).toEqual([{ user_id: INES }]);
    expect((await queryAs(db, DEMO, `select 1 from public.point_transactions`)).rows).toEqual([]);
    expect((await queryAs(db, DEMO, `select 1 from public.encounters`)).rows).toEqual([]);
    expect((await queryAs(db, DEMO, `select 1 from public.user_badges`)).rows).toEqual([]);
    const mine = (await queryAs(db, LEA, `select user_a, user_b from public.encounters`)).rows;
    expect(mine.every((row) => row.user_a === LEA || row.user_b === LEA)).toBe(true);

    await expect(
      queryAs(db, INES, `insert into public.point_transactions (school_id, user_id, amount, reason, ref_key)
                         select school_id, id, 1000, 'attendance', 'triche' from public.profiles where id = $1`, [INES]),
    ).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, INES, `update public.profiles set points_balance = 9999 where id = $1`, [INES])).rejects.toThrow(/permission denied/);
  });

  it("le profil public affiche le nombre d'activités réalisées et les badges, pas les points", async () => {
    const { rows } = await queryAs(db, ZOE, `select activities_done from public.public_profiles where id = $1`, [INES]);
    expect(rows[0].activities_done).toBe(2);
    expect((await queryAs(db, ZOE, `select badge_code from public.user_badges where user_id = $1`, [INES])).rows).toEqual([{ badge_code: 'first_step' }]);
    await expect(queryAs(db, ZOE, `select points_balance from public.public_profiles`)).rejects.toThrow(/does not exist/);
  });

  it('une personne bloquée disparaît de « Mes rencontres » (F-MATCH-05)', async () => {
    await queryAs(db, INES, `insert into public.blocks (blocked_id) values ($1)`, [TOM]);
    const names = (await queryAs(db, INES, `select first_name from public.my_encounters`)).rows.map((r) => r.first_name);
    expect(names).not.toContain('Tom');
    expect(names).toContain('Lucas');
    await queryAs(db, INES, `delete from public.blocks where blocked_id = $1`, [TOM]);
  });
});

describe('« Pour toi » (F-MATCH-03)', () => {
  it("propose d'abord l'activité où va une de mes rencontres, et jamais celles où je suis déjà inscrit", async () => {
    const create = async (as: string, title: string, category: string) =>
      (await queryAs(db, as, `insert into public.activities (title, category, starts_at, location_name, lat, lng)
                              values ($1, $2, $3, 'Lieu', 47.64, 6.85) returning id`, [title, category, inDays(3)])).rows[0].id as string;
    await db.query(`alter table public.activities disable trigger user`);
    await db.query(`update public.activities set created_at = now() - interval '2 days'`);
    await db.query(`alter table public.activities enable trigger user`);

    const withFriend = await create(INES, 'Escalade avec Ines', 'culture');
    const mine = await create(LUCAS, 'Mon activité', 'games');
    const neutral = await create(DEMO, 'Autre école', 'games');

    const titles = (await queryAs(db, LUCAS, `select id, title from public.recommended_activities()`)).rows;
    expect(titles[0].id).toBe(withFriend);
    expect(titles.map((r) => r.id)).not.toContain(mine);
    expect(titles.map((r) => r.id)).not.toContain(neutral);
  });
});

describe('suppression de compte', () => {
  it('efface mes points, mes badges et mes rencontres', async () => {
    await queryAs(db, INES, `select public.delete_my_account()`);
    for (const table of ['point_transactions', 'user_badges']) {
      expect((await db.query(`select 1 from public.${table} where user_id = $1`, [INES])).rows).toEqual([]);
    }
    expect((await db.query(`select 1 from public.encounters where $1 in (user_a, user_b)`, [INES])).rows).toEqual([]);
  });
});
