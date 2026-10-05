# UNION

Application mobile (iOS/Android) d'activités entre étudiants + back-office web pour les écoles.
**Source de vérité : `docs/UNION_Cahier_des_specifications.md`.** Le lire avant toute tâche fonctionnelle.

## Règles

- Travailler **lot par lot** (§14 du cahier). À la fin d'un lot : ce qui est fait, comment le tester sur téléphone, ce qui reste.
- Si une règle manque dans le cahier : option la plus simple, notée dans `DECISIONS.md`.
- **Logique sensible côté serveur** (points, check-in, stats, parrainage, push) : Edge Functions ou RPC `security definer`. Jamais de clé `service_role` dans `apps/mobile`.
- **RLS sur toute table dès sa création**, privilèges explicites (`revoke all` puis `grant` ciblés), et un test dans `supabase/tests/` qui prouve le cloisonnement entre écoles.
- Toute table métier porte `school_id`.
- Interface en **français, tutoiement, ton décontracté** (§12). Exception : l'écran « Besoin de parler », sobre.
- L'école ne voit **jamais** de donnée individuelle : statistiques agrégées, seuil k ≥ 5.

## Dépôt

- `apps/mobile` : Expo (SDK 57) + Expo Router + NativeWind 4 (Tailwind 3). Voir `apps/mobile/AGENTS.md` : les API Expo changent, vérifier la doc versionnée. Ajouter les dépendances avec `npx expo install`.
- `apps/admin` : Next.js 16 + Tailwind 4. Voir `apps/admin/AGENTS.md`.
- `packages/shared` : constantes communes (couleurs, catégories, barème, badges).
- `supabase/migrations` : schéma SQL versionné. `supabase/seed.sql` : écoles ESTA et démo. `supabase/README.md` : réglages à faire dans le tableau de bord Supabase.
- Routes mobile : `src/app/(auth)` (inscription, connexion), `src/app/(app)` (tout ce qui exige un compte complet). L'état de session est dans `src/lib/session.tsx`.
- Workspaces **npm** (pas pnpm). Une seule version de React dans tout le dépôt (`overrides` à la racine).

## Commandes

```bash
npm run mobile       # serveur de dev Expo
npm run admin        # back-office en local
npm run typecheck
npm run lint
npm run test:db      # tests RLS (Postgres embarqué PGlite, sans Docker)
```

Lancer typecheck, lint et test:db avant de déclarer une tâche terminée.
