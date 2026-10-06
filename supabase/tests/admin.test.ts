import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, createDb, createStudent, queryAs } from './helpers';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const SUPER = id(900);
const ADMIN = id(901); // admin de l'ESTA
const ADMIN_DEMO = id(902);
const STUDENTS = Array.from({ length: 12 }, (_, i) => id(i + 1)); // 12 étudiants ESTA
const DEMO_STUDENT = id(100);

let db: PGlite;
let esta: string;
let demo: string;

const schoolId = async (slug: string) => (await db.query<{ id: string }>(`select id from public.schools where slug = $1`, [slug])).rows[0].id;
const call = async (as: string | null, sql: string, params: unknown[] = []) => (await queryAs(db, as, sql, params)).rows;

beforeAll(async () => {
  db = await createDb();
  esta = await schoolId('esta-belfort');
  demo = await schoolId('demo');

  // 8 en « Cycle Bachelor » 1re année (dont 6 nouveaux), 4 en « Cycle Master » 4e année.
  for (const [index, student] of STUDENTS.entries()) {
    await createStudent(db, student, 'esta-belfort', `Etu${index + 1}`, index < 8
      ? { program: 'Cycle Bachelor', study_year: 1, is_newcomer: index < 6 }
      : { program: 'Cycle Master', study_year: 4 });
  }
  await createStudent(db, DEMO_STUDENT, 'demo', 'Demo');

  // Les trois admins passent par le vrai parcours : invitation, puis première connexion.
  await db.query(`insert into public.admin_invites (email, role) values ('boss@union-app.fr', 'super_admin')`);
  await createAuthUser(db, SUPER, 'Boss@union-app.fr');
  await queryAs(db, SUPER, `select public.accept_admin_invite('Aloïs', 'Cordier')`);
  await queryAs(db, SUPER, `select public.admin_invite('durand@esta-groupe.fr', 'school_admin', $1)`, [esta]);
  await createAuthUser(db, ADMIN, 'durand@esta-groupe.fr');
  await queryAs(db, ADMIN, `select public.accept_admin_invite('Claire', 'Durand')`);
  await queryAs(db, SUPER, `select public.admin_invite('admin@demo.fr', 'school_admin', $1)`, [demo]);
  await createAuthUser(db, ADMIN_DEMO, 'admin@demo.fr');
  await queryAs(db, ADMIN_DEMO, `select public.accept_admin_invite('Ad', 'Min')`);
});

describe('comptes admin (F-ADM-01, F-SUP-02)', () => {
  it("l'invitation fixe le rôle et l'école ; elle ne sert qu'une fois", async () => {
    const context = (await call(ADMIN, `select public.admin_context() as c`))[0].c as any;
    expect(context).toMatchObject({ role: 'school_admin', school_id: esta });
    expect(context.schools.map((s: any) => s.name)).toEqual(['ESTA Belfort']);
    expect(((await call(SUPER, `select public.admin_context() as c`))[0].c as any).schools).toHaveLength(2);
    await expect(queryAs(db, ADMIN, `select public.accept_admin_invite('X', 'Y')`)).rejects.toThrow(/invite_not_found/);
  });

  it("sans invitation, pas de compte admin ; un étudiant n'a aucun accès au back-office", async () => {
    await createAuthUser(db, id(950), 'intrus@gmail.com');
    await expect(queryAs(db, id(950), `select public.accept_admin_invite('In', 'Trus')`)).rejects.toThrow(/invite_not_found/);
    expect((await call(STUDENTS[0], `select public.admin_context() as c`))[0].c).toBeNull();
    for (const sql of [
      `select public.dashboard_stats($1, current_date - 30, current_date)`,
      `select * from public.admin_search_students($1, '')`,
      `select public.admin_get_school($1)`,
      `select public.admin_send_announcement($1, 'Titre', 'Corps')`,
    ]) {
      await expect(queryAs(db, STUDENTS[0], sql, [esta])).rejects.toThrow(/not_admin/);
    }
    await expect(queryAs(db, STUDENTS[0], `select * from public.admin_invites`)).rejects.toThrow(/permission denied/);
  });

  it("un admin école n'agit que sur son école ; inviter un super-admin est réservé au super-admin", async () => {
    await expect(queryAs(db, ADMIN, `select public.dashboard_stats($1, current_date - 30, current_date)`, [demo])).rejects.toThrow(/not_admin/);
    await expect(queryAs(db, ADMIN, `select public.admin_set_status($1, 'suspended')`, [DEMO_STUDENT])).rejects.toThrow(/not_admin/);
    await expect(queryAs(db, ADMIN, `select public.admin_invite('x@y.fr', 'super_admin')`)).rejects.toThrow(/not_admin/);
    await expect(queryAs(db, ADMIN, `select public.admin_create_school('X', 'x', '{x.fr}')`)).rejects.toThrow(/not_admin/);
    await queryAs(db, ADMIN, `select public.admin_invite('collegue@esta-groupe.fr', 'school_admin')`);
    const admins = await call(ADMIN, `select email, pending from public.admin_list_admins()`);
    expect(admins).toEqual([
      { email: 'durand@esta-groupe.fr', pending: false },
      { email: 'collegue@esta-groupe.fr', pending: true },
    ]);
  });

  it("le hook de création de compte laisse passer un email invité, pas un inconnu", async () => {
    const hook = async (email: string) =>
      (await db.query<{ r: any }>(`select public.hook_before_user_created($1::jsonb) as r`, [JSON.stringify({ user: { email } })])).rows[0].r;
    expect(await hook('Collegue@esta-groupe.fr')).toEqual({});
    expect(await hook('inconnu@mairie.fr')).toMatchObject({ error: { message: 'school_not_found' } });
    expect((await call(null, `select public.check_admin_email('collegue@esta-groupe.fr') as ok`))[0].ok).toBe(true);
    expect((await call(null, `select public.check_admin_email('etu1@test.local') as ok`))[0].ok).toBe(false);
  });

  it("le personnel n'apparaît pas parmi les étudiants", async () => {
    const names = (await call(STUDENTS[0], `select first_name from public.public_profiles`)).map((r) => r.first_name);
    expect(names).not.toContain('Claire');
    expect(names).toHaveLength(12);
  });
});

describe("gestion de l'école (F-ADM-02 à 04)", () => {
  it("l'admin modifie les réglages, pas les domaines ni l'abonnement", async () => {
    await queryAs(db, ADMIN, `select public.admin_update_school(null, $1::jsonb)`, [
      JSON.stringify({ declared_student_count: 20, settings: { mentoring_enabled: false }, email_domains: ['gmail.com'], is_active: false }),
    ]);
    const school = (await call(ADMIN, `select public.admin_get_school() as s`))[0].s as any;
    expect(school.declared_student_count).toBe(20);
    expect(school.settings.mentoring_enabled).toBe(false);
    expect(school.settings.programs).toEqual(['Cycle Bachelor', 'Cycle Master']); // les autres réglages sont conservés
    expect(school.email_domains).toEqual(['etudiants-esta.fr', 'esta-groupe.fr']);
    expect(school.is_active).toBe(true);
  });

  it('désigne et retire un ambassadeur (F-ADM-03)', async () => {
    const found = await call(ADMIN, `select first_name, email from public.admin_search_students(null, 'etu3@')`);
    expect(found).toEqual([{ first_name: 'Etu3', email: 'etu3@test.local' }]);
    await queryAs(db, ADMIN, `select public.admin_set_role($1, 'ambassador')`, [STUDENTS[2]]);
    expect((await call(STUDENTS[2], `select private.current_role() as r`))[0].r).toBe('ambassador');
    await expect(queryAs(db, ADMIN, `select public.admin_set_role($1, 'school_admin')`, [STUDENTS[2]])).rejects.toThrow(/role_invalid/);
    await queryAs(db, ADMIN, `select public.admin_set_role($1, 'student')`, [STUDENTS[2]]);
  });

  it("suspendre coupe l'accès tout de suite, réactiver le rend (F-MOD-04)", async () => {
    await queryAs(db, ADMIN, `select public.admin_set_status($1, 'suspended')`, [STUDENTS[11]]);
    expect(await call(STUDENTS[11], `select id from public.public_profiles`)).toEqual([]);
    await queryAs(db, ADMIN, `select public.admin_set_status($1, 'active')`, [STUDENTS[11]]);
    expect((await call(STUDENTS[11], `select id from public.public_profiles`)).length).toBe(12);
  });

  it('gère les ressources « Besoin de parler » de son école, pas les nationales (F-ADM-04)', async () => {
    const resourceId = (await call(ADMIN, `select public.admin_save_resource(null, null, 'Infirmerie', 'Bâtiment A', '0384000000', null, 'Lun-ven', 1) as id`))[0].id;
    expect((await call(STUDENTS[0], `select name from public.support_resources where school_id is not null`))).toEqual([{ name: 'Infirmerie' }]);
    await queryAs(db, ADMIN, `select public.admin_save_resource(null, $1, 'Infirmerie du campus', null, null, null, null, 1)`, [resourceId]);
    expect((await call(ADMIN, `select name, phone from public.admin_list_resources()`))).toEqual([{ name: 'Infirmerie du campus', phone: null }]);

    const national = (await db.query<{ id: string }>(`select id from public.support_resources where school_id is null limit 1`)).rows[0].id;
    await queryAs(db, ADMIN, `select public.admin_delete_resource($1)`, [national]);
    expect((await db.query(`select 1 from public.support_resources where school_id is null`)).rows).toHaveLength(4);
    await queryAs(db, ADMIN, `select public.admin_delete_resource($1)`, [resourceId]);
    expect(await call(ADMIN, `select 1 from public.admin_list_resources()`)).toEqual([]);
  });
});

describe('goodies (F-GAME-04/05, F-ADM-06)', () => {
  let rewardId: string;
  const balance = async (userId: string) =>
    (await db.query<{ points_balance: number }>(`select points_balance from public.profiles where id = $1`, [userId])).rows[0].points_balance;

  beforeAll(async () => {
    rewardId = (await call(ADMIN, `select public.admin_save_reward(null, null, 'Gourde UNION', 'Inox', null, 100, 1, true) as id`))[0].id as string;
    await db.query(`update public.profiles set points_balance = 150 where id = any($1)`, [[STUDENTS[0], STUDENTS[1]]]);
  });

  it("l'étudiant voit le catalogue de son école et échange ses points contre un code de retrait", async () => {
    expect(await call(STUDENTS[0], `select name, cost_points from public.rewards`)).toEqual([{ name: 'Gourde UNION', cost_points: 100 }]);
    expect(await call(DEMO_STUDENT, `select 1 from public.rewards`)).toEqual([]);

    const result = (await call(STUDENTS[0], `select public.redeem_reward($1) as r`, [rewardId]))[0].r as any;
    expect(result.pickup_code).toMatch(/^[0-9A-F]{6}$/);
    expect(await balance(STUDENTS[0])).toBe(50);
    expect(await call(STUDENTS[0], `select status from public.reward_redemptions`)).toEqual([{ status: 'pending' }]);
    expect(await call(STUDENTS[1], `select 1 from public.reward_redemptions`)).toEqual([]);
  });

  it('refuse sans stock ou sans assez de points', async () => {
    await expect(queryAs(db, STUDENTS[1], `select public.redeem_reward($1)`, [rewardId])).rejects.toThrow(/reward_out_of_stock/);
    await queryAs(db, ADMIN, `select public.admin_save_reward(null, $1, 'Gourde UNION', 'Inox', null, 100, 5, true)`, [rewardId]);
    await expect(queryAs(db, STUDENTS[2], `select public.redeem_reward($1)`, [rewardId])).rejects.toThrow(/not_enough_points/);
    await expect(queryAs(db, DEMO_STUDENT, `select public.redeem_reward($1)`, [rewardId])).rejects.toThrow(/reward_not_found/);
  });

  it("l'annulation par l'admin rend les points et le stock ; « remis » clôt la demande", async () => {
    const pending = (await call(ADMIN, `select id, student, pickup_code, status from public.admin_list_redemptions()`))[0];
    expect(pending).toMatchObject({ student: 'Etu1 Test', status: 'pending' });
    await queryAs(db, ADMIN, `select public.admin_set_redemption($1, 'cancelled')`, [pending.id]);
    expect(await balance(STUDENTS[0])).toBe(150);
    expect((await db.query<{ stock: number }>(`select stock from public.rewards where id = $1`, [rewardId])).rows[0].stock).toBe(6);
    await expect(queryAs(db, ADMIN, `select public.admin_set_redemption($1, 'delivered')`, [pending.id])).rejects.toThrow(/redemption_not_found/);

    await queryAs(db, STUDENTS[0], `select public.redeem_reward($1)`, [rewardId]);
    const next = (await call(ADMIN, `select id from public.admin_list_redemptions() where status = 'pending'`))[0];
    await expect(queryAs(db, ADMIN_DEMO, `select public.admin_set_redemption($1, 'delivered')`, [next.id])).rejects.toThrow(/not_admin/);
    await queryAs(db, ADMIN, `select public.admin_set_redemption($1, 'delivered')`, [next.id]);
    expect(await balance(STUDENTS[0])).toBe(50);
  });
});

describe('annonces (F-ADM-07)', () => {
  const send = (title: string, program: string | null = null) =>
    call(ADMIN, `select public.admin_send_announcement(null, $1, 'Rendez-vous jeudi au foyer.', null, $2) as n`, [title, program]);
  const received = async (userId: string) =>
    (await db.query(`select 1 from public.notifications where user_id = $1 and type = 'announcement'`, [userId])).rows.length;

  it("part vers toute l'école ou une formation, jamais vers une autre école", async () => {
    expect((await send('Soirée de rentrée'))[0].n).toBe(12);
    expect((await send('Info Master', 'Cycle Master'))[0].n).toBe(4);
    expect(await received(STUDENTS[0])).toBe(1);
    expect(await received(STUDENTS[9])).toBe(2);
    expect(await received(DEMO_STUDENT)).toBe(0);
    expect(await received(ADMIN)).toBe(0);
  });

  it('est limitée à 3 par semaine, et à 50 / 180 caractères', async () => {
    await send('Troisième annonce');
    await expect(send('Quatrième annonce')).rejects.toThrow(/announcement_quota/);
    expect(await call(ADMIN, `select recipients_count from public.admin_list_announcements()`)).toHaveLength(3);
    await db.query(`update public.announcements set sent_at = now() - interval '8 days'`);
    await expect(send('x'.repeat(51))).rejects.toThrow(/announcement_invalid/);
  });
});

describe('dashboard anonymisé (F-DASH)', () => {
  const stats = async (as: string, program: string | null = null, year: number | null = null) =>
    (await call(as, `select public.dashboard_stats(null, current_date - 30, current_date, $1, $2) as s`, [program, year]))[0].s as any;

  beforeAll(async () => {
    // Une activité passée où 6 étudiants (Etu1 à Etu6) étaient inscrits et 5 présents.
    const activityId = (await call(STUDENTS[0], `insert into public.activities (title, category, starts_at, location_name, lat, lng, max_participants)
      values ('Foot de rentrée', 'sport', now() + interval '2 days', 'Stade', 47.64, 6.85, 12) returning id`))[0].id as string;
    for (const student of STUDENTS.slice(1, 6)) await queryAs(db, student, `select public.join_activity($1)`, [activityId]);
    await db.query(`alter table public.activities disable trigger user`);
    await db.query(`update public.activities set starts_at = now() - interval '3 days', ends_at = now() - interval '3 days' + interval '2 hours' where id = $1`, [activityId]);
    await db.query(`alter table public.activities enable trigger user`);
    await db.query(`update public.activity_participants set checked_in_at = now() - interval '3 days', checkin_method = 'qr'
                    where activity_id = $1 and user_id = any($2)`, [activityId, STUDENTS.slice(0, 5)]);
    await db.query(`update public.profiles set last_seen_at = now() where id = any($1)`, [STUDENTS.slice(0, 7)]);
    // Les comptes existent depuis 10 jours : la présence tombe dans leurs 30 premiers jours.
    await db.query(`update public.profiles set created_at = now() - interval '10 days' where id = any($1)`, [STUDENTS]);
    for (const [index, student] of STUDENTS.slice(0, 6).entries()) {
      await queryAs(db, student, `select public.submit_integration_survey('signup', $1)`, [index + 3]);
    }
  });

  it("donne les indicateurs agrégés de l'école", async () => {
    const s = await stats(ADMIN);
    expect(s).toMatchObject({
      masked: false,
      registered: 12,
      adoption_rate: 0.6, // 12 inscrits sur 20 déclarés
      active_7d: 7,
      engaged: 5,
      engagement_rate: 0.417,
      sociability_index: 4, // chacun des 5 présents a croisé les 4 autres
      sociability_rate: 0.417,
      participation_rate: 0.833, // 5 présents sur 6 inscrits
      fill_rate: 0.5, // 6 inscrits pour 12 places
      newcomers: { count: 6, engaged_30d_rate: 0.833 },
      activities: { total: 1, official: 0, student: 1, by_category: { sport: 1 } },
      integration: { signup: { responses: 6, average: 5.5 }, d60: { masked: true } },
    });
    expect(s.weekly.reduce((sum: number, week: any) => sum + week.activities, 0)).toBe(1);
    expect(s.weekly.some((week: any) => week.engagement_rate === 0.417 && week.sociability_index === 4)).toBe(true);
  });

  it('masque tout segment de moins de 5 étudiants (k-anonymat)', async () => {
    const s = await stats(ADMIN);
    expect(s.by_program).toEqual([
      { label: 'Cycle Bachelor', students: 8, engagement_rate: 0.625 },
      { label: 'Cycle Master', masked: true },
    ]);
    expect(s.by_study_year).toEqual([
      { label: '1', students: 8, engagement_rate: 0.625 },
      { label: '4', masked: true },
    ]);
    // Filtrer sur le petit segment ne renvoie rien du tout, pas même l'effectif.
    expect(await stats(ADMIN, 'Cycle Master')).toEqual({ masked: true, threshold: 5 });
    expect(await stats(ADMIN, null, 4)).toEqual({ masked: true, threshold: 5 });
    expect((await stats(ADMIN, 'Cycle Bachelor')).registered).toBe(8);
  });

  it('une moyenne portant sur moins de 5 personnes est masquée, même dans une grande population', async () => {
    // Une seconde activité où seuls 2 étudiants étaient présents, la semaine précédente.
    await db.query(`update public.activity_participants set checked_in_at = null where user_id = any($1)`, [STUDENTS.slice(2, 5)]);
    const s = await stats(ADMIN);
    expect(s.engaged).toBe(2);
    expect(s.sociability_index).toBeNull();
    expect(s.weekly.every((week: any) => week.sociability_index === null)).toBe(true);
  });

  it("ne contient aucun identifiant d'étudiant, et n'est accessible qu'aux admins de l'école", async () => {
    const text = JSON.stringify(await stats(ADMIN));
    for (const student of STUDENTS) expect(text).not.toContain(student);
    expect(text).not.toMatch(/Etu\d|@test\.local/);
    await expect(stats(ADMIN_DEMO)).resolves.toEqual({ masked: true, threshold: 5 }); // l'école démo n'a qu'un étudiant
    expect((await call(SUPER, `select public.dashboard_stats($1, current_date - 30, current_date) as s`, [esta]))[0].s).toMatchObject({ registered: 12 });
    await expect(queryAs(db, SUPER, `select public.dashboard_stats(null, current_date - 30, current_date)`)).rejects.toThrow(/school_required/);
    // Les tables sources restent fermées à l'admin : il ne lit ni les points ni les réponses au sondage.
    expect(await call(ADMIN, `select 1 from public.point_transactions`)).toEqual([]);
    expect(await call(ADMIN, `select 1 from public.integration_surveys`)).toEqual([]);
    expect(await call(ADMIN, `select 1 from public.encounters`)).toEqual([]);
  });
});

describe('écoles (F-SUP)', () => {
  it('le super-admin crée une école et suit la plateforme', async () => {
    const newId = (await call(SUPER, `select public.admin_create_school('IUT Belfort', 'iut-belfort', '{IUT-BM.fr}') as id`))[0].id;
    expect((await call(null, `select school_name from public.check_school_domain('a@iut-bm.fr')`))).toEqual([{ school_name: 'IUT Belfort' }]);
    expect((await call(SUPER, `select public.admin_overview() as o`))[0].o).toMatchObject({ schools: 3, active_schools: 3, students: 13 });
    await queryAs(db, SUPER, `select public.admin_update_school($1, '{"email_domains": ["iut-bm.fr", "etu.iut-bm.fr"]}'::jsonb)`, [newId]);
    expect((await call(null, `select 1 from public.check_school_domain('a@etu.iut-bm.fr')`))).toHaveLength(1);
  });

  it("une école dont l'abonnement est terminé n'accepte plus d'inscription et ses étudiants ne lisent plus rien (F-SUP-04)", async () => {
    await queryAs(db, SUPER, `select public.admin_update_school($1, $2::jsonb)`, [demo, JSON.stringify({ subscription_ends_at: '2020-01-01' })]);
    expect(await call(null, `select 1 from public.check_school_domain('a@demo.union-app.fr')`)).toEqual([]);
    expect(await call(DEMO_STUDENT, `select 1 from public.public_profiles`)).toEqual([]);
    expect((await call(SUPER, `select public.admin_overview() as o`))[0].o).toMatchObject({ active_schools: 2 });
    // Les données sont conservées : en réactivant l'école, tout revient.
    await queryAs(db, SUPER, `select public.admin_update_school($1, '{"subscription_ends_at": null}'::jsonb)`, [demo]);
    expect(await call(DEMO_STUDENT, `select 1 from public.public_profiles`)).toHaveLength(1);
  });

  it("une activité officielle créée par l'école n'inscrit pas l'admin comme participant (F-ADM-08)", async () => {
    const activity = (await call(ADMIN, `insert into public.activities (title, category, is_official, starts_at, location_name, lat, lng)
      values ('Journée d''accueil', 'parties', true, now() + interval '5 days', 'Campus', 47.64, 6.85) returning id, is_official`))[0];
    expect(activity.is_official).toBe(true);
    expect((await db.query(`select 1 from public.activity_participants where activity_id = $1`, [activity.id])).rows).toEqual([]);
    expect((await call(STUDENTS[0], `select registered_count from public.activity_cards where id = $1`, [activity.id]))[0].registered_count).toBe(0);
  });
});

describe('last_seen (F-DASH-02)', () => {
  it("l'app signale une ouverture, au plus une fois par heure", async () => {
    await db.query(`update public.profiles set last_seen_at = null where id = $1`, [STUDENTS[8]]);
    await queryAs(db, STUDENTS[8], `select public.touch_last_seen()`);
    const first = (await db.query<{ t: string }>(`select last_seen_at::text as t from public.profiles where id = $1`, [STUDENTS[8]])).rows[0].t;
    expect(first).not.toBeNull();
    await queryAs(db, STUDENTS[8], `select public.touch_last_seen()`);
    expect((await db.query<{ t: string }>(`select last_seen_at::text as t from public.profiles where id = $1`, [STUDENTS[8]])).rows[0].t).toBe(first);
  });
});
