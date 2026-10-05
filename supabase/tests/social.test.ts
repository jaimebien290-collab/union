import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDb, createStudent, queryAs } from './helpers';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const [LUCAS, INES, MARC, ZOE, TOM, DEMO] = [id(1), id(2), id(3), id(4), id(5), id(6)];

let db: PGlite;

beforeAll(async () => {
  db = await createDb();
  await createStudent(db, LUCAS, 'esta-belfort', 'Lucas');
  await createStudent(db, INES, 'esta-belfort', 'Ines');
  await createStudent(db, MARC, 'esta-belfort', 'Marc', { role: 'ambassador' });
  await createStudent(db, ZOE, 'esta-belfort', 'Zoe');
  await createStudent(db, TOM, 'esta-belfort', 'Tom');
  await createStudent(db, DEMO, 'demo', 'Demo');
});

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function createActivity(as: string, title = 'Foot du jeudi') {
  const { rows } = await queryAs(
    db,
    as,
    `insert into public.activities (title, category, starts_at, location_name, lat, lng)
     values ($1, 'sport', $2, 'Stade', 47.64, 6.85) returning id`,
    [title, inDays(2)],
  );
  const activityId = rows[0].id as string;
  const conversation = await db.query<{ id: string }>(`select id from public.conversations where activity_id = $1`, [activityId]);
  return { activityId, conversationId: conversation.rows[0].id };
}

const join = (as: string, activityId: string) => queryAs(db, as, `select public.join_activity($1)`, [activityId]);
const leave = (as: string, activityId: string) => queryAs(db, as, `select public.leave_activity($1)`, [activityId]);
const send = async (as: string, conversationId: string, content: string) =>
  (await queryAs(db, as, `insert into public.messages (conversation_id, content) values ($1, $2) returning id`, [conversationId, content]))
    .rows[0].id as string;
const read = async (as: string, conversationId: string) =>
  (await queryAs(db, as, `select content from public.messages where conversation_id = $1 order by created_at`, [conversationId])).rows.map(
    (r) => r.content,
  );
const openDirect = async (as: string, other: string) =>
  (await queryAs(db, as, `select public.open_direct_conversation($1) as id`, [other])).rows[0].id as string;
const report = async (as: string, type: string, targetId: string, reason = 'harassment') =>
  (await queryAs(db, as, `select public.report_content($1, $2, $3, 'pas cool') as result`, [type, targetId, reason])).rows[0].result;
const notificationsOf = async (userId: string) =>
  (await db.query<{ type: string }>(`select type from public.notifications where user_id = $1`, [userId])).rows.map((r) => r.type);

describe("discussion d'activité (F-CHAT-01)", () => {
  it("est créée avec l'activité ; les inscrits y lisent et écrivent, pas les autres", async () => {
    const { activityId, conversationId } = await createActivity(LUCAS);
    await join(INES, activityId);
    await send(LUCAS, conversationId, 'Salut, RDV 18h devant le stade');
    await send(INES, conversationId, "J'apporte un ballon");

    expect(await read(INES, conversationId)).toEqual(['Salut, RDV 18h devant le stade', "J'apporte un ballon"]);
    expect(await read(ZOE, conversationId)).toEqual([]);
    await expect(send(ZOE, conversationId, 'coucou')).rejects.toThrow(/conversation_not_found/);
    expect(await read(DEMO, conversationId)).toEqual([]);
    await expect(send(DEMO, conversationId, 'coucou')).rejects.toThrow(/conversation_not_found/);
  });

  it('un désinscrit quitte la discussion, et la retrouve en se réinscrivant', async () => {
    const { activityId, conversationId } = await createActivity(LUCAS);
    await join(INES, activityId);
    await send(LUCAS, conversationId, 'Bienvenue');
    await leave(INES, activityId);
    expect(await read(INES, conversationId)).toEqual([]);
    await expect(send(INES, conversationId, 'encore là ?')).rejects.toThrow(/conversation_not_found/);
    await join(INES, activityId);
    expect(await read(INES, conversationId)).toEqual(['Bienvenue']);
  });

  it("n'accepte pas d'usurper l'auteur, et refuse un message vide", async () => {
    const { conversationId } = await createActivity(LUCAS);
    await expect(
      queryAs(db, LUCAS, `insert into public.messages (conversation_id, content, sender_id) values ($1, 'x', $2)`, [conversationId, INES]),
    ).rejects.toThrow(/permission denied/);
    await expect(send(LUCAS, conversationId, '   ')).rejects.toThrow(/check/);
  });

  it('passe en lecture seule 7 jours après la fin, puis disparaît de la liste à 30 jours', async () => {
    const { activityId, conversationId } = await createActivity(LUCAS);
    await send(LUCAS, conversationId, 'Super moment');
    const shift = async (days: number) => {
      await db.query(`alter table public.activities disable trigger user`);
      await db.query(`update public.activities set starts_at = now() - $2 * interval '1 day' - interval '2 hours', ends_at = now() - $2 * interval '1 day' where id = $1`, [activityId, days]);
      await db.query(`alter table public.activities enable trigger user`);
    };
    const listed = async () =>
      (await queryAs(db, LUCAS, `select writable from public.conversation_list where id = $1`, [conversationId])).rows;

    await shift(6);
    expect(await listed()).toEqual([{ writable: true }]);
    await shift(8);
    expect(await listed()).toEqual([{ writable: false }]);
    await expect(send(LUCAS, conversationId, 'trop tard')).rejects.toThrow(/conversation_read_only/);
    expect(await read(LUCAS, conversationId)).toEqual(['Super moment']);
    await shift(31);
    expect(await listed()).toEqual([]);
  });
});

describe('messages privés (F-CHAT-02)', () => {
  it('une seule conversation par binôme, quel que soit celui qui ouvre', async () => {
    const first = await openDirect(LUCAS, INES);
    expect(await openDirect(INES, LUCAS)).toBe(first);
    await send(LUCAS, first, 'Tu viens jeudi ?');
    expect(await read(INES, first)).toEqual(['Tu viens jeudi ?']);
    expect(await read(MARC, first)).toEqual([]);
  });

  it("impossible avec soi-même ou avec quelqu'un d'une autre école", async () => {
    await expect(openDirect(LUCAS, LUCAS)).rejects.toThrow(/user_unavailable/);
    await expect(openDirect(LUCAS, DEMO)).rejects.toThrow(/user_unavailable/);
  });

  it('la liste donne le titre, le dernier message et les non-lus ; lire remet le compteur à zéro', async () => {
    const conversationId = await openDirect(LUCAS, ZOE);
    await send(LUCAS, conversationId, 'Hello');
    await send(LUCAS, conversationId, 'Tu fais quoi ce week-end ?');
    const list = `select other_first_name, last_message, unread_count from public.conversation_list where id = $1`;
    expect((await queryAs(db, ZOE, list, [conversationId])).rows[0]).toEqual({
      other_first_name: 'Lucas',
      last_message: 'Tu fais quoi ce week-end ?',
      unread_count: 2,
    });
    expect((await queryAs(db, LUCAS, list, [conversationId])).rows[0].unread_count).toBe(0);

    await queryAs(db, ZOE, `update public.conversation_members set last_read_at = now() where conversation_id = $1 and user_id = $2`, [conversationId, ZOE]);
    expect((await queryAs(db, ZOE, list, [conversationId])).rows[0].unread_count).toBe(0);
    // On ne touche pas à la ligne de l'autre.
    const other = await queryAs(db, ZOE, `update public.conversation_members set muted = true where conversation_id = $1 and user_id = $2`, [conversationId, LUCAS]);
    expect(other.affected).toBe(0);
  });
});

describe('blocage (F-CHAT-05)', () => {
  it("coupe les messages privés, masque les profils dans les deux sens, et l'autre n'en sait rien", async () => {
    const conversationId = await openDirect(TOM, ZOE);
    await send(TOM, conversationId, 'Salut');
    await queryAs(db, ZOE, `insert into public.blocks (blocked_id) values ($1)`, [TOM]);

    await expect(send(TOM, conversationId, 'Tu réponds ?')).rejects.toThrow(/conversation_read_only/);
    await expect(openDirect(TOM, ZOE)).rejects.toThrow(/user_unavailable/);
    const sees = async (as: string, other: string) =>
      (await queryAs(db, as, `select 1 from public.public_profiles where id = $1`, [other])).rows.length === 1;
    expect(await sees(TOM, ZOE)).toBe(false);
    expect(await sees(ZOE, TOM)).toBe(false);
    expect((await queryAs(db, TOM, `select 1 from public.blocks`)).rows).toEqual([]);
    expect((await queryAs(db, ZOE, `select 1 from public.conversation_list where id = $1`, [conversationId])).rows).toEqual([]);
    expect((await queryAs(db, ZOE, `select first_name from public.my_blocked_users()`)).rows).toEqual([{ first_name: 'Tom' }]);
  });

  it("dans une discussion de groupe, on ne voit plus les messages de la personne bloquée", async () => {
    const { activityId, conversationId } = await createActivity(LUCAS, 'Sortie bowling');
    await join(TOM, activityId);
    await join(ZOE, activityId);
    await send(TOM, conversationId, 'Message de Tom');
    await send(LUCAS, conversationId, 'Message de Lucas');
    expect(await read(ZOE, conversationId)).toEqual(['Message de Lucas']);
    expect(await read(LUCAS, conversationId)).toEqual(['Message de Tom', 'Message de Lucas']);
  });

  it('se lève en supprimant le blocage', async () => {
    await queryAs(db, ZOE, `delete from public.blocks where blocked_id = $1`, [TOM]);
    const conversationId = await openDirect(TOM, ZOE);
    await send(TOM, conversationId, 'Re');
    expect(await read(ZOE, conversationId)).toContain('Re');
  });

  it("on ne bloque pas quelqu'un d'une autre école, ni au nom d'un autre", async () => {
    await expect(queryAs(db, LUCAS, `insert into public.blocks (blocked_id) values ($1)`, [DEMO])).rejects.toThrow(/user_unavailable/);
    await expect(
      queryAs(db, LUCAS, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [INES, ZOE]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('signalements et modération (F-MOD)', () => {
  const queue = async (as: string) => (await queryAs(db, as, `select * from public.moderation_queue()`)).rows;
  const resolve = (as: string, type: string, targetId: string, action: string) =>
    queryAs(db, as, `select public.resolve_reports($1, $2, $3)`, [type, targetId, action]);

  it('un message est masqué automatiquement au 3e signalement distinct (F-MOD-02)', async () => {
    const { activityId, conversationId } = await createActivity(LUCAS, 'Soirée jeux');
    for (const user of [INES, ZOE, MARC, TOM]) await join(user, activityId);
    const messageId = await send(TOM, conversationId, 'Message déplacé');

    expect(await report(INES, 'message', messageId)).toBe('reported');
    expect(await report(INES, 'message', messageId)).toBe('reported'); // deux fois le même : compte pour un
    expect(await report(ZOE, 'message', messageId)).toBe('reported');
    expect(await read(LUCAS, conversationId)).toContain('Message déplacé');
    expect(await report(LUCAS, 'message', messageId)).toBe('hidden');
    expect(await read(INES, conversationId)).not.toContain('Message déplacé');

    // F-MOD-03 : l'ambassadeur le voit dans la file, pas un étudiant.
    const item = (await queue(MARC)).find((row) => row.target_id === messageId);
    expect(item).toMatchObject({ target_type: 'message', report_count: 3, preview: 'Message déplacé', is_hidden: true, author_name: 'Tom Test' });
    await expect(queue(INES)).rejects.toThrow(/not_moderator/);

    // Rejet : le message revient, les signaleurs sont remerciés (F-MOD-05).
    await resolve(MARC, 'message', messageId, 'dismiss');
    expect(await read(INES, conversationId)).toContain('Message déplacé');
    expect(await notificationsOf(INES)).toContain('report_handled');
    expect((await queue(MARC)).find((row) => row.target_id === messageId)).toBeUndefined();
  });

  it("on ne signale ni son propre contenu, ni ce qu'on ne peut pas voir", async () => {
    const { conversationId } = await createActivity(LUCAS, 'Révisions partiels');
    const messageId = await send(LUCAS, conversationId, 'Qui a les annales ?');
    await expect(report(LUCAS, 'message', messageId)).rejects.toThrow(/report_own_content/);
    await expect(report(ZOE, 'message', messageId)).rejects.toThrow(/report_target_not_found/);
    await expect(report(DEMO, 'user', LUCAS)).rejects.toThrow(/report_target_not_found/);
    await expect(report(INES, 'user', LUCAS, 'auto_filter')).rejects.toThrow(/reason_invalid/);
  });

  it('une activité signalée 3 fois est masquée ; la modération peut confirmer, les inscrits sont prévenus', async () => {
    const { activityId } = await createActivity(TOM, 'Activité douteuse');
    await join(INES, activityId);
    for (const user of [INES, ZOE]) await report(user, 'activity', activityId, 'spam');
    expect(await report(LUCAS, 'activity', activityId, 'spam')).toBe('hidden');

    const visible = async (as: string) =>
      (await queryAs(db, as, `select 1 from public.activities where id = $1`, [activityId])).rows.length === 1;
    expect(await visible(INES)).toBe(false);
    expect(await visible(TOM)).toBe(true); // l'auteur
    expect(await visible(MARC)).toBe(true); // le modérateur
    expect(await notificationsOf(INES)).toContain('activity_cancelled');

    await resolve(MARC, 'activity', activityId, 'hide');
    expect(await visible(INES)).toBe(false);
    const statuses = (await db.query<{ status: string }>(`select distinct status from public.reports where target_id = $1`, [activityId])).rows;
    expect(statuses).toEqual([{ status: 'actioned' }]);
  });

  it("un avertissement notifie l'auteur ; un ambassadeur ne traite pas ce qui le concerne (F-MOD-07)", async () => {
    await report(INES, 'user', TOM, 'fake_profile');
    await resolve(MARC, 'user', TOM, 'warn');
    expect(await notificationsOf(TOM)).toContain('moderation_warning');
    await expect(resolve(MARC, 'user', TOM, 'warn')).rejects.toThrow(/report_target_not_found/);

    await report(INES, 'user', MARC);
    expect((await queue(MARC)).find((row) => row.target_id === MARC)).toBeUndefined();
    await expect(resolve(MARC, 'user', MARC, 'dismiss')).rejects.toThrow(/moderator_concerned/);
    await expect(resolve(MARC, 'user', ZOE, 'hide')).rejects.toThrow(/action_invalid/);
    await expect(resolve(INES, 'user', MARC, 'dismiss')).rejects.toThrow(/not_moderator/);
  });

  it('un message insultant part quand même, marqué pour revue (F-CHAT-09)', async () => {
    const conversationId = await openDirect(TOM, INES);
    const messageId = await send(TOM, conversationId, 'Espèce de connard');
    expect(await read(INES, conversationId)).toContain('Espèce de connard');
    expect((await queue(MARC)).find((row) => row.target_id === messageId)).toMatchObject({ reasons: ['auto_filter'] });
    const clean = await send(TOM, conversationId, 'On se retrouve au concert ?');
    expect((await queue(MARC)).find((row) => row.target_id === clean)).toBeUndefined();
  });

  it('les signalements des autres ne sont pas lisibles', async () => {
    expect((await queryAs(db, TOM, `select 1 from public.reports`)).rows).toEqual([]);
    expect((await queryAs(db, INES, `select 1 from public.reports`)).rows.length).toBeGreaterThan(0);
  });
});

describe("notifications dans l'app", () => {
  it('on marque les siennes comme lues, pas celles des autres', async () => {
    const mark = `update public.notifications set read_at = now() where user_id = $1`;
    expect((await queryAs(db, INES, mark, [INES])).affected).toBeGreaterThan(0);
    expect((await queryAs(db, INES, mark, [TOM])).affected).toBe(0);
    expect((await queryAs(db, INES, `select 1 from public.notifications where user_id <> $1`, [INES])).rows).toEqual([]);
  });
});

describe('limite de débit et suppression de compte', () => {
  it('30 messages par minute maximum (NF-SEC-04)', async () => {
    const conversationId = await openDirect(ZOE, INES);
    for (let i = 0; i < 30; i++) await send(ZOE, conversationId, `message ${i}`);
    await expect(send(ZOE, conversationId, 'un de trop')).rejects.toThrow(/too_many_messages/);
  });

  it('mes messages restent après la suppression de mon compte, sous « Utilisateur supprimé »', async () => {
    const conversationId = await openDirect(ZOE, INES);
    await queryAs(db, ZOE, `select public.delete_my_account()`);
    expect((await read(INES, conversationId)).length).toBe(30);
    const row = (await queryAs(db, INES, `select other_first_name, writable from public.conversation_list where id = $1`, [conversationId])).rows[0];
    expect(row).toEqual({ other_first_name: null, writable: false });
    await expect(queryAs(db, INES, `insert into public.messages (conversation_id, content) values ($1, 'tu es là ?')`, [conversationId])).rejects.toThrow(
      /conversation_read_only/,
    );
  });
});
