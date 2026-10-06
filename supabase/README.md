# Mise en place du projet Supabase

À faire une fois par environnement (dev, puis prod). Compter 15 minutes.

## 1. Créer le projet

- Sur supabase.com : **New project**, région **Europe** (Paris ou Francfort) — obligatoire (NF-RGPD-01).
- Noter le mot de passe de la base.

## 2. Appliquer le schéma

Sur un projet vide, en une fois :

1. dans le dossier du projet, lancer `npm run db:bundle` : cela crée `supabase/.temp/setup.sql` (toutes les
   migrations + les écoles ESTA et démo) ;
2. ouvrir ce fichier, tout copier, coller dans **SQL Editor** et cliquer sur **Run**.

Tout passe dans une seule transaction : en cas d'erreur, rien n'est appliqué. Pour une base déjà en place,
n'exécuter que les nouveaux fichiers de `migrations/`, par ordre de nom.

Pour s'inscrire sans adresse de l'école pendant les tests, ajouter son propre domaine à l'école démo
(à ne jamais faire en production) :

```sql
update public.schools set email_domains = email_domains || '{mon-domaine.fr}' where slug = 'demo';
```

## 3. Régler l'authentification

Dans **Authentication** :

| Où | Réglage | Valeur |
|---|---|---|
| Sign In / Providers → Email | Email OTP Length | **6** (attention : un projet neuf est réglé sur 8, l'app en attend 6) |
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

## 4. Envoi des emails — bloquant pour l'inscription par code

Constaté le 6 octobre 2026 sur le projet de dev : **tant qu'aucun SMTP personnalisé n'est configuré, Supabase
verrouille les modèles d'email**. L'email par défaut contient un lien (« Your sign-in link »), pas le code à
6 chiffres : l'inscription par code de l'app (F-AUTH-02) ne peut donc pas aboutir. Le service intégré est en plus
limité à quelques emails par heure.

À faire avant la bêta : **Authentication → Emails → SMTP Settings** avec un compte Brevo ou Resend (Resend demande
un nom de domaine), puis coller `templates/otp.html` dans les modèles **Magic link or OTP** et **Confirm sign up**.

En attendant, pour tester tout le reste : créer les comptes de test dans **Authentication → Users → Add user**
(email + mot de passe, « Auto Confirm User » coché), puis dans l'app passer par **J'ai déjà un compte**. L'app
enchaîne sur « Parle-nous de toi » et termine l'inscription normalement.

## 5. Brancher l'app

Dans **Project Settings → API**, copier l'URL du projet et la clé **anon / publishable** dans `apps/mobile/.env`
(modèle : `apps/mobile/.env.example`). **Jamais la clé `service_role`.** Relancer `npm run mobile`.
