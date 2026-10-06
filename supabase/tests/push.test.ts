import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, createStudent, queryAs } from './helpers';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const [LUCAS, INES, MARC, DEMO] = [id(1), id(2), id(3), id(4)];
const token = (name: string) => `ExponentPushToken[${name}]`;

let db: PGlite;

beforeAll(async () => {
  db = await createDb();
  await createStudent(db, LUCAS, 'esta-belfort', 'Lucas');
  await createStudent(db, INES, 'esta-belfort', 'Ines');
  await createStudent(db, MARC, 'esta-belfort', 'Marc');
  await createStudent(db, DEMO, 'demo', 'Demo');
});

const register = (as: string, name: string, platform = 'ios') =>
  queryAs(db, as, `select public.register_push_token($1, $2)`, [token(name), platform]);
/** Ce qui partirait vers les téléphones maintenant. */
const claim = async () =>
  (await db.query<{ token: string; title: string; body: string; data: any }>(`select * from private.claim_push_batch()`)).rows;
const pending = async (userId: string, type?: string) =>
  (await db.query<{ type: string; body: string }>(
    `select type, body from public.notifications where user_id = $1 and sent_at is null ${type ? `and type = '${type}'` : ''} order by created_at`, [userId])).rows;
const notify = (userId: string, type: string, data = '{}') =>
  db.query(`insert into public.notifications (school_id, user_id, type, title, body, data)
            select school_id, id, $2, 'Titre', 'Corps', $3::jsonb from public.profiles where id = $1`, [userId, type, data]);
/** Force l'heure « de Paris » vue par les heures calmes, en décalant created_at n'y changerait rien : on teste la fonction directement. */
const quiet = async (at: string) =>
  (await db.query<{ q: boolean }>(`select private.in_quiet_hours($1::timestamptz) as q`, [at])).rows[0].q;

beforeEach(async () => {
  await db.query(`delete from public.notifications`);
});

describe('jetons (push_tokens)', () => {
  it("enregistre le téléphone ; un téléphone ne sert qu'un compte à la fois", async () => {
    await register(LUCAS, 'tel-1');
    await register(INES, 'tel-1'); // Inès se connecte sur le même téléphone
    const rows = (await db.query<{ user_id: string }>(`select user_id from public.push_tokens where token = $1`, [token('tel-1')])).rows;
    expect(rows).toEqual([{ user_id: INES }]);
    await register(LUCAS, 'tel-lucas', 'android');
  });

  it('refuse un jeton mal formé ; on ne retire que son propre jeton', async () => {
    await expect(register(LUCAS, 'x', 'windows')).rejects.toThrow(/push_token_invalid/);
    await expect(queryAs(db, LUCAS, `select public.register_push_token('nimporte', 'ios')`)).rejects.toThrow(/push_token_invalid/);
    await queryAs(db, LUCAS, `select public.unregister_push_token($1)`, [token('tel-1')]);
    expect((await db.query(`select 1 from public.push_tokens where token = $1`, [token('tel-1')])).rows).toHaveLength(1);
  });
});

describe('heures calmes (F-NOTIF-12)', () => {
  it('de 22 h à 8 h, heure de Paris', async () => {
    expect(await quiet('2027-01-15 21:30:00+01')).toBe(false);
    expect(await quiet('2027-01-15 22:00:00+01')).toBe(true);
    expect(await quiet('2027-01-16 07:59:00+01')).toBe(true);
    expect(await quiet('2027-01-16 08:00:00+01')).toBe(false);
    // En été Paris est à UTC+2 : 20 h UTC, c'est déjà 22 h.
    expect(await quiet('2027-07-15 20:00:00+00')).toBe(true);
  });
});

describe('messages (F-NOTIF-04)', () => {
  it('prévient les autres membres, regroupe les messages non envoyés, respecte la sourdine', async () => {
    const conversationId = (await queryAs(db, LUCAS, `select public.open_direct_conversation($1) as id`, [INES])).rows[0].id as string;
    const send = (as: string, content: string) =>
      queryAs(db, as, `insert into public.messages (conversation_id, content) values ($1, $2)`, [conversationId, content]);

    await send(LUCAS, 'Tu viens jeudi ?');
    expect(await pending(INES)).toEqual([{ type: 'message', body: 'Tu viens jeudi ?' }]);
    expect(await pending(LUCAS)).toEqual([]);

    await send(LUCAS, 'Réponds stp');
    expect(await pending(INES)).toEqual([{ type: 'message', body: 'Plusieurs nouveaux messages' }]);

    await db.query(`delete from public.notifications`);
    await queryAs(db, INES, `update public.conversation_members set muted = true where conversation_id = $1 and user_id = $2`, [conversationId, INES]);
    await send(LUCAS, 'Allô ?');
    expect(await pending(INES)).toEqual([]);
    await queryAs(db, INES, `update public.conversation_members set muted = false where conversation_id = $1 and user_id = $2`, [conversationId, INES]);
  });
});

describe('rappels (F-NOTIF-01)', () => {
  it("« dans 1 h » : une fois par inscrit, pour les activités qui commencent dans l'heure", async () => {
    const create = async (title: string, startsAt: string) => {
      const activityId = (await queryAs(db, LUCAS, `insert into public.activities (title, category, starts_at, location_name, lat, lng)
        values ($1, 'sport', now() + interval '2 days', 'Stade', 47.64, 6.85) returning id`, [title])).rows[0].id as string;
      await queryAs(db, INES, `select public.join_activity($1)`, [activityId]);
      await db.query(`alter table public.activities disable trigger user`);
      await db.query(`update public.activities set starts_at = ${startsAt}, ends_at = ${startsAt} + interval '2 hours' where id = $1`, [activityId]);
      await db.query(`alter table public.activities enable trigger user`);
      return activityId;
    };
    const soon = await create('Foot dans 40 min', `now() + interval '40 minutes'`);
    await create('Foot dans 3 h', `now() + interval '3 hours'`);

    await db.query(`select private.enqueue_reminders()`);
    await db.query(`select private.enqueue_reminders()`); // le second passage ne double rien
    const reminders = (await db.query<{ user_id: string; activity: string }>(
      `select user_id, data ->> 'activity_id' as activity from public.notifications where type = 'reminder_hour' order by user_id`)).rows;
    expect(reminders).toEqual([
      { user_id: LUCAS, activity: soon },
      { user_id: INES, activity: soon },
    ]);
  });
});

describe('envoi (claim_push_batch)', () => {
  // Les heures calmes dépendent de l'heure réelle : on teste avec un type qui passe toujours (reminder_hour),
  // et le comportement des heures calmes séparément ci-dessus.
  it('une ligne par téléphone, avec le lien à ouvrir ; marque la notification comme partie', async () => {
    await notify(LUCAS, 'reminder_hour', JSON.stringify({ activity_id: id(77) }));
    const batch = await claim();
    expect(batch).toEqual([
      { token: token('tel-lucas'), title: 'Titre', body: 'Corps', data: { activity_id: id(77), type: 'reminder_hour', url: `/activity/${id(77)}` } },
    ]);
    expect(await claim()).toEqual([]);
    expect(await pending(LUCAS)).toEqual([]);
  });

  it('respecte les réglages par type (F-NOTIF-10), sans bloquer la file', async () => {
    await queryAs(db, LUCAS, `update public.profiles set notification_prefs = '{"reminders": false}' where id = $1`, [LUCAS]);
    await notify(LUCAS, 'reminder_hour');
    await notify(INES, 'reminder_hour');
    expect((await claim()).map((row) => row.token)).toEqual([token('tel-1')]);
    expect(await pending(LUCAS)).toEqual([]); // marquée traitée : elle reste lisible dans l'app, sans push
    await queryAs(db, LUCAS, `update public.profiles set notification_prefs = '{}' where id = $1`, [LUCAS]);
  });

  it("n'envoie rien de plus vieux que 24 h, ni à un compte sans téléphone ou suspendu", async () => {
    await notify(LUCAS, 'reminder_hour');
    await db.query(`update public.notifications set created_at = now() - interval '25 hours'`);
    await notify(MARC, 'reminder_hour'); // Marc n'a enregistré aucun téléphone
    await notify(INES, 'reminder_hour');
    await db.query(`update public.profiles set status = 'suspended' where id = $1`, [INES]);
    expect(await claim()).toEqual([]);
    await db.query(`update public.profiles set status = 'active' where id = $1`, [INES]);
  });

  it('associe chaque type à sa famille de réglage et à son écran', async () => {
    const rows = (await db.query<{ type: string; category: string; url: string }>(`
      select t.type, private.notification_category(t.type) as category, private.notification_url(t.type, t.data::jsonb) as url
      from (values ('message', '{"conversation_id": "c1"}'), ('activity_cancelled', '{"activity_id": "a1"}'), ('mentorship_proposed', '{}'),
                   ('announcement', '{}'), ('badge_unlocked', '{}'), ('reward_update', '{}'), ('report_handled', '{}')) as t (type, data)`)).rows;
    expect(rows).toEqual([
      { type: 'message', category: 'messages', url: '/conversation/c1' },
      { type: 'activity_cancelled', category: 'activities', url: '/activity/a1' },
      { type: 'mentorship_proposed', category: 'mentoring', url: '/mentoring' },
      { type: 'announcement', category: 'announcements', url: '/notifications' },
      { type: 'badge_unlocked', category: 'rewards', url: '/points' },
      { type: 'reward_update', category: 'rewards', url: '/shop' },
      { type: 'report_handled', category: 'moderation', url: '/notifications' },
    ]);
  });

  it("les fonctions d'envoi ne sont pas appelables par un étudiant", async () => {
    await expect(queryAs(db, LUCAS, `select * from private.claim_push_batch()`)).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, LUCAS, `select private.push_tick()`)).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, null, `select public.register_push_token($1, 'ios')`, [token('x')])).rejects.toThrow(/permission denied/);
  });
});
