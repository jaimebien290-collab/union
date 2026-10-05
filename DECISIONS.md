# Journal des décisions

Décisions prises en cours de développement quand le cahier des spécifications ne tranche pas. La plus récente en bas.

## Lot 0 — Fondations (5 octobre 2026)

| # | Décision | Pourquoi |
|---|---|---|
| 1 | Workspaces **npm** plutôt que pnpm | npm est déjà installé sur le poste ; le cahier demande un « monorepo simple » |
| 2 | **Expo SDK 57**, Next.js 16, **NativeWind 4.2.7 avec Tailwind 3** côté mobile (Tailwind 4 côté admin) | Versions stables au jour du démarrage. NativeWind 5 est encore en release candidate |
| 3 | Une seule version de React (19.2.3, celle d'Expo) imposée par `overrides` à la racine | Expo ne supporte pas deux versions de React dans un monorepo |
| 4 | Tests RLS sur **PGlite** (Postgres embarqué) avec un faux schéma `auth` | Pas de Docker sur le poste, donc pas de Supabase local. Les tests tournent en 3 s, y compris en CI. Limite : ce n'est pas l'instance Supabase réelle, à compléter par un test de bout en bout quand le projet existera |
| 5 | Onglets en `expo-router/js-tabs` plutôt que les onglets natifs du gabarit | Le bouton central « Créer » demande une icône personnalisée |
| 6 | Session Supabase stockée dans **AsyncStorage** | Recommandation Supabase ; SecureStore limite la taille des valeurs |
| 7 | Identifiant d'app `fr.unionapp.union` (iOS et Android), schéma de lien `union://` | **À valider avant la première soumission store : non modifiable ensuite** |
| 8 | Lecture des autres profils via la vue `public_profiles` (security definer) ; la table `profiles` ne renvoie que sa propre ligne | Garantit que email, date de naissance et points ne sortent jamais (F-PROF-02) |
| 9 | Colonnes protégées de `profiles` (`role`, `points_balance`, `status`, `is_mentor`, `school_id`, `email`) par privilèges de colonne, pas par trigger | Plus simple et vérifiable par test |
| 10 | Contrôle des 18 ans par trigger en base, en plus du contrôle applicatif à venir | Un `check` ne peut pas dépendre de la date du jour |
| 11 | Un étudiant ne lit pas `email_domains`, `declared_student_count`, `subscription_ends_at` de son école | Données contractuelles, inutiles à l'app |
| 12 | Un compte suspendu ou supprimé n'a plus d'« école courante » : il ne lit plus rien | Applique F-AUTH-09 au niveau des données, pas seulement à l'écran de connexion |
| 13 | Sentry installé mais inactif tant que `EXPO_PUBLIC_SENTRY_DSN` est vide ; envoi des sourcemaps désactivé dans `eas.json` | Pas encore de compte Sentry |
| 14 | Seed limité aux deux écoles ; pas de comptes étudiants | Créer des lignes `auth.users` à la main est fragile ; les comptes de test passeront par l'inscription (lot 1) |

## Lot 1 — Compte et profil (5 octobre 2026)

| # | Décision | Pourquoi |
|---|---|---|
| 15 | Inscription et « mot de passe oublié » suivent le même chemin : email → code → mot de passe | Un seul modèle d'email et un seul jeu d'écrans. Conséquence : quelqu'un qui a déjà un compte et refait « C'est parti » choisit simplement un nouveau mot de passe |
| 16 | « 5 essais max » sur le code (F-AUTH-02) : on s'appuie sur la limitation de débit de Supabase Auth | Supabase ne propose pas de compteur d'essais par code. À revoir si l'équipe veut la règle exacte |
| 17 | Le filtrage par domaine est appliqué trois fois : dans l'app, par un hook Supabase à la création du compte, et dans `complete_signup` | L'app seule ne suffit pas, l'API d'authentification est publique |
| 18 | Mineur : le compte d'authentification est supprimé (`abandon_signup` côté app, et de nouveau dans `complete_signup`) | F-AUTH-04 « aucune donnée conservée », alors que le compte existe déjà après le code |
| 19 | Suppression de compte : la ligne `auth.users` est réellement supprimée, le profil est gardé anonymisé (« Utilisateur supprimé »). D'où la suppression de la clé étrangère `profiles → auth.users` | L'email est libéré et effacé ; les futurs messages gardent un auteur |
| 20 | Formation : liste définie par l'école (`schools.settings.programs`), saisie libre si la liste est vide | Une saisie libre casserait le filtre « formation » du dashboard et l'attribution des parrains |
| 21 | Photos dans un bucket **privé**, lisibles seulement par les étudiants de la même école (URL signée d'une heure) | F-PROF-02 : profil visible de la même école uniquement |
| 22 | Ordre des étapes : la photo vient après les CGU (et non avant) ; les CGU, la confidentialité et la charte s'acceptent par une seule case | L'envoi de la photo exige un profil existant ; une case = moins de friction (objectif 3 minutes) |
| 23 | Reporté : autorisation des notifications (lot 2, avec les premières notifications), proposition de parrain (lot 5), profil public des autres étudiants avec message/bloquer/signaler (lots 2 et 3) | Aucun écran ne permet encore d'y accéder ; les notifications push ne marchent pas dans Expo Go sur Android |
| 24 | Export des données : JSON en texte dans la feuille de partage, pas en fichier joint | Plus simple, aucune dépendance. À transformer en fichier si le groupe y tient |
| 25 | Compte suspendu : déconnexion immédiate côté app + plus aucune lecture côté base. Le blocage de la connexion elle-même viendra avec la suspension (lot 3) | Personne ne peut encore suspendre un compte |

## Lot 2 — Activités (5 octobre 2026)

| # | Décision | Pourquoi |
|---|---|---|
| 26 | Création et modification par écriture directe dans `activities` (RLS + privilèges de colonne + triggers de validation) ; inscription, désinscription et annulation par fonctions serveur | Les triggers imposent auteur, école, fenêtre de dates, quota et badge officiel ; les places exigent un verrou transactionnel |
| 27 | Liste d'attente : numéro d'ordre croissant jamais renuméroté ; premier arrivé, premier promu | Simple et sans ambiguïté |
| 28 | Augmenter le nombre de places promeut la liste d'attente ; on ne peut pas descendre sous le nombre d'inscrits | Le cahier ne dit rien ; évite de désinscrire quelqu'un d'office |
| 29 | On peut s'inscrire jusqu'au début de l'activité (comme la désinscription, F-ACT-07) | Le cahier ne fixe pas de limite pour l'inscription |
| 30 | Une activité annulée reste visible avec le badge « Annulée » ; elle n'est plus modifiable | Les inscrits doivent comprendre pourquoi elle a disparu de leur agenda |
| 31 | Les notifications (modification, annulation, place libérée) sont déposées dans une table `notifications` ; **rien n'est encore envoyé sur les téléphones** | L'envoi push (lot 3) demande un build de développement et un compte Expo ; la file sera consommée telle quelle |
| 32 | Rappels J-1 et H-1, autorisation des notifications : lot 3, avec l'envoi | Même raison |
| 33 | Adresses : géocodage de la Géoplateforme (`data.geopf.fr`) | C'est le successeur de l'API Adresse (BAN) prévue au §9.1, même données, sans clé |
| 34 | Calendrier : fiche d'ajout native pré-remplie (`expo-calendar/legacy`) | Aucune permission à demander ; la nouvelle API d'expo-calendar ne fonctionne pas dans Expo Go |
| 35 | Supprimer son compte annule ses activités à venir (inscrits prévenus) et libère ses places | Sinon des activités resteraient sans organisateur |
| 36 | Couvertures dans un bucket privé `covers`, lisibles dans l'école seulement | Même logique que les photos de profil |
| 37 | Reporté : check-in (lot 4), partage par lien et duplication (F-ACT-12/13, S), mise à jour de l'événement du calendrier (F-CAL-03, S), centrage sur ma position (F-DISC-05), cache hors connexion (NF-PERF-03) | Priorités S ou dépendances d'autres lots ; à reprendre avant la bêta |

### Point d'attention pour le build Android

`react-native-maps` exige une **clé API Google Maps** dans `app.json` pour le build de développement et la production
Android (pas dans Expo Go). À créer dans Google Cloud avant le premier build EAS.

### Point d'attention pour le lot 6

Le hook « Before User Created » refusera aussi les comptes admin dont l'email n'est pas celui d'une école
(super-admin UNION). Il faudra prévoir une liste d'exceptions à ce moment-là.

### À faire valider par le groupe

- Liste des formations ESTA dans `supabase/seed.sql` (« Cycle Bachelor », « Cycle Master ») : provisoire.
- Adresse d'assistance `support@union-app.fr` : provisoire, le domaine reste à réserver.
- Textes des CGU, de la confidentialité et de la charte dans l'app : provisoires, à valider juridiquement (lot 7).

- Coordonnées du campus et effectif ESTA dans `supabase/seed.sql` : valeurs approximatives.
- Couleurs par catégorie (`packages/shared/src/colors.json`) : proposition libre.
- Icône et écran de démarrage : encore ceux du gabarit Expo.
