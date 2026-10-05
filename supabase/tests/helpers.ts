import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = join(__dirname, '..');

// Ce que Supabase fournit d'office et dont les migrations dépendent : rôles API, schémas auth et storage.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role supabase_auth_admin nologin;

  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1];
  $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
`;

export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(root, 'migrations');
  for (const file of readdirSync(dir).sort()) {
    await db.exec(readFileSync(join(dir, file), 'utf8'));
  }
  await db.exec(readFileSync(join(root, 'seed.sql'), 'utf8'));
  return db;
}

type Row = Record<string, unknown>;

/** Exécute une requête comme le ferait l'API pour cet utilisateur (ou en anonyme si userId est null). */
export async function queryAs(db: PGlite, userId: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
    const res = await tx.query<Row>(sql, params);
    return { rows: res.rows, affected: res.affectedRows ?? 0 };
  });
}

/** Compte dont l'email est vérifié mais qui n'a pas encore de profil (état juste après l'OTP). */
export async function createAuthUser(db: PGlite, id: string, email: string) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
}

export async function createStudent(
  db: PGlite,
  id: string,
  schoolSlug: string,
  firstName: string,
  overrides: Row = {},
) {
  const email = `${firstName.toLowerCase()}@test.local`;
  await createAuthUser(db, id, email);
  const cols: Row = {
    id,
    first_name: firstName,
    last_name: 'Test',
    email,
    birth_date: '2000-01-01',
    cgu_accepted_at: new Date().toISOString(),
    ...overrides,
  };
  const names = Object.keys(cols);
  await db.query(
    `insert into public.profiles (school_id, ${names.join(', ')})
     select s.id, ${names.map((_, i) => `$${i + 2}`).join(', ')} from public.schools s where s.slug = $1`,
    [schoolSlug, ...Object.values(cols)],
  );
}
