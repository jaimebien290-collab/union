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

## Lot 3 — Social (5 octobre 2026)

| # | Décision | Pourquoi |
|---|---|---|
| 38 | **Lot coupé en deux.** Fait : messagerie, blocage, signalements, modération, notifications consultables dans l'app. Reste : envoi push, rappels J-1 / H-1, réglages par type de notification (F-NOTIF-01 à 12) | Les push ne se testent pas dans Expo Go et demandent un compte Expo + un build de développement. Rien n'est écrit tant que ce n'est pas testable |
| 39 | Écran « Notifications » (cloche sur l'accueil) qui liste la file `notifications` | Sans push, c'était le seul moyen de voir une annulation, une place libérée ou le retour d'un signalement |
| 40 | Discussion d'activité : membres = inscrits uniquement (pas la liste d'attente). Un trigger unique sur les inscriptions tient la liste des membres à jour | F-CHAT-01 ; une seule règle couvre inscription, désinscription, promotion et suppression de compte |
| 41 | Lecture seule à J+7 et disparition de la liste à J+30 calculées à la volée depuis la date de fin | Pas de tâche planifiée à maintenir. La suppression réelle des messages à 12 mois (NF-RGPD-04) reste à planifier |
| 42 | Blocage : masque les profils dans les deux sens (participants, fiches, photos), coupe les messages privés, et cache les messages de l'autre dans les discussions de groupe. Les activités de l'autre restent visibles | « Nous ne nous voyons plus dans les listes » (F-CHAT-05), interprété pour les listes de personnes |
| 43 | Écran « Personnes bloquées » dans les réglages | Une personne bloquée n'étant plus visible nulle part, il fallait un endroit pour la débloquer |
| 44 | Masquage automatique à 3 signalements : activités et messages seulement. Trois signalements sur une personne ne déclenchent rien d'automatique | F-MOD-02 parle de « contenu » ; la suspension est réservée à l'école (F-MOD-04, lot 6) |
| 45 | Une activité masquée reste visible de son auteur et des modérateurs ; ses inscrits reçoivent « Cette activité a été retirée » | Le cahier ne précise pas |
| 46 | « Avertir l'utilisateur » envoie une notification à l'auteur et clôt le signalement sans toucher au contenu | Trois actions distinctes dans F-MOD-03 |
| 47 | F-MOD-07 : un modérateur ne voit pas et ne traite pas les signalements dont il est l'auteur du contenu (ou la personne visée) | Lecture retenue de « qui le concerne » |
| 48 | Filtre d'insultes (F-CHAT-09) : une courte liste de mots en base ; le message part et un signalement automatique est créé | Volontairement minimal, à enrichir après la bêta |
| 49 | Le signalement n'indique jamais son auteur à la personne visée ni aux modérateurs | Protéger ceux qui signalent |

## Lot 4 — Présence et engagement (6 octobre 2026)

| # | Décision | Pourquoi |
|---|---|---|
| 50 | QR de présence = `activité.minute.signature`, signé avec un secret par activité gardé dans un schéma non exposé ; accepté pendant la minute en cours et la précédente | NF-SEC-03 : une capture d'écran partagée cesse de marcher en 2 minutes au plus |
| 51 | L'organisateur ne scanne rien : sa présence est validée avec celle du premier participant | Il affiche le QR, il ne peut pas le scanner ; et seul, il ne gagne aucun point (pas d'activités fantômes) |
| 52 | Pointage manuel réservé à l'organisateur et aux ambassadeurs, jamais pour soi-même | §4.3. **Risque connu : un organisateur peut cocher des absents.** La méthode (`qr` / `manual`) est enregistrée pour pouvoir le repérer |
| 53 | Chaque crédit de points est unique par (utilisateur, raison, clé). Au-delà du plafond de 60/jour, la ligne est enregistrée à 0 point | Empêche un double crédit et garde la trace de la présence |
| 54 | Le plafond quotidien se compte sur la journée UTC | Plus simple ; l'écart avec l'heure française est d'une ou deux heures autour de minuit |
| 55 | Badge « Régulier » : au moins une présence dans chacune des 4 dernières semaines calendaires | Lecture retenue de « 1 activité par semaine pendant 4 semaines » |
| 56 | « Pour toi » : barème du cahier, activités à venir où je ne suis pas inscrit et où il reste de la place, score minimum 2 | Avec un score de 1, toute activité de la semaine serait « pour toi » |
| 57 | Points et rencontres lisibles par leur propriétaire uniquement ; les badges et le nombre d'activités réalisées font partie du profil public | F-PROF-02 |
| 58 | Les fonctions internes (schéma `private`) ne sont plus exécutables par les utilisateurs, sauf celles dont les règles d'accès ont besoin | Défense en profondeur |
| 59 | Reporté : boutique de goodies (lot 6, elle dépend du back-office), « top 20 % » (F-GAME-06, S), animation de déblocage des badges, points de parrainage (lot 5) | Dépendances ou priorité S |

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
