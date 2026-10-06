// Assemble toutes les migrations et le seed en un seul fichier à coller dans le SQL Editor de Supabase.
// Usage : npm run db:bundle  →  supabase/.temp/setup.sql (non versionné). Pour un projet VIDE uniquement.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const migrations = readdirSync(join(root, 'migrations')).sort();

const parts = [
  ...migrations.map((file) => `-- ===== ${file} =====\n${readFileSync(join(root, 'migrations', file), 'utf8')}`),
  `-- ===== seed.sql =====\n${readFileSync(join(root, 'seed.sql'), 'utf8')}`,
];

mkdirSync(join(root, '.temp'), { recursive: true });
const out = join(root, '.temp', 'setup.sql');
// Une seule transaction : si une migration échoue, rien n'est appliqué.
writeFileSync(out, `begin;\n\n${parts.join('\n\n')}\n\ncommit;\n`);
console.log(`${migrations.length} migrations + seed → ${out}`);
