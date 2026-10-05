# Mise en place du projet Supabase

À faire une fois par environnement (dev, puis prod). Compter 15 minutes.

## 1. Créer le projet

- Sur supabase.com : **New project**, région **Europe** (Paris ou Francfort) — obligatoire (NF-RGPD-01).
- Noter le mot de passe de la base.

## 2. Appliquer le schéma

Dans **SQL Editor**, coller et exécuter dans l'ordre :

1. chaque fichier de `migrations/`, par ordre de nom ;
2. `seed.sql` (écoles ESTA et démo).

## 3. Régler l'authentification

Dans **Authentication** :

| Où | Réglage | Valeur |
|---|---|---|
| Sign In / Providers → Email | Email OTP Length | **6** |
| Sign In / Providers → Email | Email OTP Expiration | **600** secondes (F-AUTH-02) |
| Sign In / Providers → Email | Minimum password length | **8** |
| Sign In / Providers → Email | Password requirements | **Lettres et chiffres** (F-AUTH-03) |
| Emails → Templates → **Magic Link** et **Confirm signup** | Corps | contenu de `templates/otp.html` ; objet : `Ton code UNION : {{ .Token }}` |
| Hooks → **Before User Created** | Postgres function | `public.hook_before_user_created` (F-AUTH-01) |

Sans le modèle d'email, Supabase envoie un lien au lieu du code à 6 chiffres. Sans le hook, l'app refuse quand même
les emails hors école, mais un compte vide pourrait être créé en appelant l'API directement.

## 3 bis. Temps réel de la messagerie

La migration `social` ajoute la table `messages` à la publication `supabase_realtime`. Pour vérifier :
**Database → Publications → supabase_realtime** doit lister `messages`. Sans cela, les messages n'arrivent
qu'au rafraîchissement (toutes les 30 secondes).

## 4. Envoi des emails

Le service d'envoi intégré est limité à quelques emails par heure et réservé aux tests. Avant d'ouvrir à plus de
quelques testeurs : **Authentication → Emails → SMTP Settings**, avec un compte Resend ou Brevo.

## 5. Brancher l'app

Dans **Project Settings → API**, copier l'URL du projet et la clé **anon / publishable** dans `apps/mobile/.env`
(modèle : `apps/mobile/.env.example`). **Jamais la clé `service_role`.** Relancer `npm run mobile`.
