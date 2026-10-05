import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, createDb, createStudent, queryAs } from './helpers';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

let db: PGlite;

beforeAll(async () => {
  db = await createDb();
});

const SIGNUP = `select public.complete_signup($1, $2, $3, $4, $5, $6, $7, $8) as result`;
const lucas = ['Lucas', 'Martin', '2005-03-12', 'Cycle Bachelor', 1, true, ['sport', 'games'], true];

function yearsAgo(years: number, offsetDays = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function authUserExists(userId: string) {
  return (await db.query(`select 1 from auth.users where id = $1`, [userId])).rows.length === 1;
}

describe('complete_signup', () => {
  it("crée le profil dans l'école du domaine, avec la date d'acceptation des CGU", async () => {
    await createAuthUser(db, id(1), 'Lucas.Martin@ESTA-Groupe.fr');
    const { rows } = await queryAs(db, id(1), SIGNUP, lucas);
    expect(rows[0].result).toBe('ok');

    const profile = (
      await db.query<Record<string, unknown>>(
        `select p.email, p.role, p.status, p.is_newcomer, p.interests, p.cgu_accepted_at, s.slug
         from public.profiles p join public.schools s on s.id = p.school_id where p.id = $1`,
        [id(1)],
      )
    ).rows[0];
    expect(profile).toMatchObject({
      email: 'lucas.martin@esta-groupe.fr',
      role: 'student',
      status: 'active',
      is_newcomer: true,
      interests: ['sport', 'games'],
      slug: 'esta-belfort',
    });
    expect(profile.cgu_accepted_at).not.toBeNull();
  });

  it('refuse une seconde création pour le même compte', async () => {
    await expect(queryAs(db, id(1), SIGNUP, lucas)).rejects.toThrow(/profile_exists/);
  });

  it('refuse un mineur et supprime son compte (F-AUTH-04)', async () => {
    await createAuthUser(db, id(2), 'mineur@esta-groupe.fr');
    const params = [...lucas];
    params[2] = yearsAgo(18, 1); // 18 ans demain
    const { rows } = await queryAs(db, id(2), SIGNUP, params);
    expect(rows[0].result).toBe('underage');
    expect(await authUserExists(id(2))).toBe(false);
    expect((await db.query(`select 1 from public.profiles where id = $1`, [id(2)])).rows).toEqual([]);
  });

  it("accepte quelqu'un qui a 18 ans aujourd'hui", async () => {
    await createAuthUser(db, id(3), 'majeur@esta-groupe.fr');
    const params = [...lucas];
    params[2] = yearsAgo(18);
    expect((await queryAs(db, id(3), SIGNUP, params)).rows[0].result).toBe('ok');
  });

  it.each([
    ['un email hors école partenaire', 'x@gmail.com', lucas, /school_not_found/],
    ['des CGU non acceptées', 'a@esta-groupe.fr', [...lucas.slice(0, 7), false], /terms_required/],
    ['un prénom vide', 'b@esta-groupe.fr', ['  ', ...lucas.slice(1)], /name_invalid/],
    ["une formation hors de la liste de l'école", 'c@esta-groupe.fr', [...lucas.slice(0, 3), 'Inventée', ...lucas.slice(4)], /program_invalid/],
    ["un centre d'intérêt inconnu", 'd@esta-groupe.fr', [...lucas.slice(0, 6), ['poney'], true], /profiles_interests_valid/],
  ])('refuse %s', async (_label, email, params, error) => {
    const userId = id(10 + Math.floor(Math.random() * 1e6));
    await createAuthUser(db, userId, email as string);
    await expect(queryAs(db, userId, SIGNUP, params as unknown[])).rejects.toThrow(error as RegExp);
    expect((await db.query(`select 1 from public.profiles where id = $1`, [userId])).rows).toEqual([]);
  });

  it("refuse un email non vérifié", async () => {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, 'nv@esta-groupe.fr', null)`, [id(4)]);
    await expect(queryAs(db, id(4), SIGNUP, lucas)).rejects.toThrow(/email_not_verified/);
  });

  it("accepte une formation libre quand l'école n'a pas défini de liste", async () => {
    await createAuthUser(db, id(5), 'demo@demo.union-app.fr');
    const params = [...lucas];
    params[3] = 'Licence Info';
    expect((await queryAs(db, id(5), SIGNUP, params)).rows[0].result).toBe('ok');
  });

  it("n'est pas appelable sans session", async () => {
    await expect(queryAs(db, null, SIGNUP, lucas)).rejects.toThrow(/permission denied/);
  });
});

describe('hook_before_user_created (F-AUTH-01)', () => {
  const hook = async (email: string) =>
    (await db.query<{ r: Record<string, unknown> }>(`select public.hook_before_user_created($1::jsonb) as r`, [
      JSON.stringify({ user: { email } }),
    ])).rows[0].r;

  it("laisse passer un email d'école partenaire", async () => {
    expect(await hook('Nouveau@esta-groupe.fr')).toEqual({});
  });

  it('bloque les autres', async () => {
    expect(await hook('nouveau@gmail.com')).toMatchObject({ error: { http_code: 403, message: 'school_not_found' } });
  });

  it("n'est pas appelable par un étudiant", async () => {
    await expect(queryAs(db, id(1), `select public.hook_before_user_created('{}'::jsonb)`)).rejects.toThrow(/permission denied/);
  });
});

describe('abandon_signup', () => {
  it('supprime un compte sans profil', async () => {
    await createAuthUser(db, id(6), 'abandon@esta-groupe.fr');
    await queryAs(db, id(6), `select public.abandon_signup()`);
    expect(await authUserExists(id(6))).toBe(false);
  });

  it('ne touche pas à un compte qui a un profil', async () => {
    await queryAs(db, id(1), `select public.abandon_signup()`);
    expect(await authUserExists(id(1))).toBe(true);
  });
});

describe('export_my_data (F-AUTH-10)', () => {
  it('renvoie mes données, et seulement les miennes', async () => {
    const { rows } = await queryAs(db, id(1), `select public.export_my_data() as data`);
    const data = rows[0].data as { profile: Record<string, unknown>; school: string };
    expect(data.profile.id).toBe(id(1));
    expect(data.profile.birth_date).toBe('2005-03-12');
    expect(data.school).toBe('ESTA Belfort');
  });
});

describe('photos de profil', () => {
  const INES = id(7);
  const DEMO = id(5);
  const path = (userId: string) => `${userId}/photo.jpg`;
  const insert = (as: string, owner: string) =>
    queryAs(db, as, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [path(owner)]);

  beforeAll(async () => {
    await createStudent(db, INES, 'esta-belfort', 'Ines');
  });

  it('on dépose une photo dans son dossier, pas dans celui des autres', async () => {
    expect((await insert(id(1), id(1))).affected).toBe(1);
    await expect(insert(INES, id(1))).rejects.toThrow(/row-level security/);
  });

  it("la photo est visible dans l'école, invisible depuis une autre", async () => {
    const select = `select name from storage.objects where bucket_id = 'avatars'`;
    expect((await queryAs(db, INES, select)).rows).toHaveLength(1);
    expect((await queryAs(db, DEMO, select)).rows).toEqual([]);
  });

  it('seul le propriétaire peut la supprimer', async () => {
    const del = `delete from storage.objects where name = $1`;
    expect((await queryAs(db, INES, del, [path(id(1))])).affected).toBe(0);
    expect((await queryAs(db, id(1), del, [path(id(1))])).affected).toBe(1);
  });

  it("avatar_url doit pointer dans son propre dossier", async () => {
    const update = `update public.profiles set avatar_url = $2 where id = $1`;
    expect((await queryAs(db, id(1), update, [id(1), path(id(1))])).affected).toBe(1);
    await expect(queryAs(db, id(1), update, [id(1), path(INES)])).rejects.toThrow(/profiles_avatar_path/);
  });
});

describe('delete_my_account (F-AUTH-08)', () => {
  it('anonymise le profil et supprime le compte', async () => {
    await db.query(`insert into public.push_tokens (user_id, token, platform) values ($1, 'tok', 'android')`, [id(1)]);
    await queryAs(db, id(1), `select public.delete_my_account()`);

    const profile = (await db.query<Record<string, unknown>>(`select * from public.profiles where id = $1`, [id(1)])).rows[0];
    expect(profile).toMatchObject({
      first_name: 'Utilisateur',
      last_name: 'supprimé',
      email: null,
      avatar_url: null,
      bio: null,
      interests: [],
      status: 'deleted',
    });
    expect(await authUserExists(id(1))).toBe(false);
    expect((await db.query(`select 1 from public.push_tokens where user_id = $1`, [id(1)])).rows).toEqual([]);
  });

  it("le profil supprimé n'apparaît plus pour les autres étudiants", async () => {
    const { rows } = await queryAs(db, id(7), `select id from public.public_profiles where id = $1`, [id(1)]);
    expect(rows).toEqual([]);
  });
});
