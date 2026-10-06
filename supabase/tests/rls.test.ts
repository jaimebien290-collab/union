import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDb, createStudent, queryAs } from './helpers';

const LUCAS = '00000000-0000-0000-0000-00000000000a'; // ESTA
const INES = '00000000-0000-0000-0000-00000000000b'; // ESTA
const SUSPENDU = '00000000-0000-0000-0000-00000000000c'; // ESTA, suspendu
const DEMO = '00000000-0000-0000-0000-00000000000d'; // école démo

let db: PGlite;

beforeAll(async () => {
  db = await createDb();
  await createStudent(db, LUCAS, 'esta-belfort', 'Lucas');
  await createStudent(db, INES, 'esta-belfort', 'Ines');
  await createStudent(db, SUSPENDU, 'esta-belfort', 'Suspendu', { status: 'suspended' });
  await createStudent(db, DEMO, 'demo', 'Demo');
  await db.query(`insert into public.push_tokens (user_id, token, platform) values ($1, 'tok-lucas', 'ios')`, [LUCAS]);
});

describe('cloisonnement par école (NF-SEC-01)', () => {
  it("un étudiant de l'école démo ne voit aucun profil de l'ESTA", async () => {
    const { rows } = await queryAs(db, DEMO, `select first_name from public.public_profiles`);
    expect(rows.map((r) => r.first_name)).toEqual(['Demo']);
  });

  it('un étudiant ESTA voit les profils actifs de son école, et seulement eux', async () => {
    const { rows } = await queryAs(db, LUCAS, `select first_name from public.public_profiles order by first_name`);
    expect(rows.map((r) => r.first_name)).toEqual(['Ines', 'Lucas']);
  });

  it("la table profiles ne renvoie que sa propre ligne, même en l'interrogeant directement", async () => {
    const { rows } = await queryAs(db, DEMO, `select id from public.profiles`);
    expect(rows.map((r) => r.id)).toEqual([DEMO]);
  });

  it('un étudiant ne lit que son école', async () => {
    const { rows } = await queryAs(db, DEMO, `select slug from public.schools`);
    expect(rows.map((r) => r.slug)).toEqual(['demo']);
  });

  it("les colonnes contractuelles de l'école ne sont pas lisibles", async () => {
    await expect(queryAs(db, LUCAS, `select declared_student_count from public.schools`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("les jetons push d'un autre utilisateur sont invisibles", async () => {
    expect((await queryAs(db, INES, `select token from public.push_tokens`)).rows).toEqual([]);
    expect((await queryAs(db, LUCAS, `select token from public.push_tokens`)).rows).toHaveLength(1);
  });

  it('un compte suspendu ne voit plus personne', async () => {
    expect((await queryAs(db, SUSPENDU, `select id from public.public_profiles`)).rows).toEqual([]);
    expect((await queryAs(db, SUSPENDU, `select id from public.schools`)).rows).toEqual([]);
  });

  it('un visiteur non connecté ne lit rien', async () => {
    for (const table of ['schools', 'profiles', 'public_profiles', 'push_tokens']) {
      await expect(queryAs(db, null, `select * from public.${table}`)).rejects.toThrow(/permission denied/);
    }
  });
});

describe('écriture sur les profils', () => {
  it('on peut modifier sa bio', async () => {
    const { affected } = await queryAs(db, LUCAS, `update public.profiles set bio = 'Foot et jeux vidéo' where id = $1`, [LUCAS]);
    expect(affected).toBe(1);
  });

  it.each(['role', 'points_balance', 'status', 'school_id', 'is_mentor'])(
    'on ne peut pas modifier sa colonne %s',
    async (column) => {
      const value = { role: `'ambassador'`, points_balance: '9999', status: `'active'`, school_id: 'school_id', is_mentor: 'true' }[column];
      await expect(
        queryAs(db, LUCAS, `update public.profiles set ${column} = ${value} where id = $1`, [LUCAS]),
      ).rejects.toThrow(/permission denied/);
    },
  );

  it("on ne peut pas modifier le profil d'un autre", async () => {
    const { affected } = await queryAs(db, LUCAS, `update public.profiles set bio = 'piraté' where id = $1`, [INES]);
    expect(affected).toBe(0);
  });

  it('on ne peut ni créer ni supprimer un profil directement', async () => {
    await expect(queryAs(db, LUCAS, `delete from public.profiles where id = $1`, [LUCAS])).rejects.toThrow(/permission denied/);
    await expect(
      queryAs(db, LUCAS, `insert into public.profiles (id, school_id, first_name, last_name, email, birth_date, cgu_accepted_at)
                          select gen_random_uuid(), school_id, 'X', 'Y', 'x@y.z', '2000-01-01', now() from public.profiles`),
    ).rejects.toThrow(/permission denied/);
  });

  it('un mineur est refusé (D10)', async () => {
    const birth = new Date();
    birth.setFullYear(birth.getFullYear() - 17);
    await expect(
      createStudent(db, '00000000-0000-0000-0000-00000000000e', 'esta-belfort', 'Mineur', {
        birth_date: birth.toISOString().slice(0, 10),
      }),
    ).rejects.toThrow(/18 ans/);
  });
});

describe('check_school_domain (F-AUTH-01)', () => {
  it("reconnaît l'école sans session, sans tenir compte de la casse", async () => {
    const { rows } = await queryAs(db, null, `select school_name from public.check_school_domain($1)`, [
      'Lucas.Martin@ESTA-Groupe.fr',
    ]);
    expect(rows).toEqual([{ school_name: 'ESTA Belfort' }]);
  });

  it("reconnaît les adresses étudiantes de l'ESTA", async () => {
    const { rows } = await queryAs(db, null, `select school_name from public.check_school_domain($1)`, [
      'prenom.nom@etudiants-esta.fr',
    ]);
    expect(rows).toEqual([{ school_name: 'ESTA Belfort' }]);
  });

  it('ne renvoie rien pour un domaine inconnu ou un email mal formé', async () => {
    for (const email of ['lucas@gmail.com', 'esta-groupe.fr', '@esta-groupe.fr', 'lucas@sub.esta-groupe.fr']) {
      expect((await queryAs(db, null, `select * from public.check_school_domain($1)`, [email])).rows).toEqual([]);
    }
  });

  it('ignore une école inactive', async () => {
    await db.exec(`update public.schools set is_active = false where slug = 'demo'`);
    const { rows } = await queryAs(db, null, `select * from public.check_school_domain('a@demo.union-app.fr')`);
    expect(rows).toEqual([]);
    await db.exec(`update public.schools set is_active = true where slug = 'demo'`);
  });
});
