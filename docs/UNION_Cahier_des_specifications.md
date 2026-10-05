# UNION — Cahier des spécifications (V1)

> **Projet :** Nouveau Départ — EIP groupe 23, ESTA Belfort
> **Application :** UNION
> **Équipe :** Aloïs Cordier (coordination, développement), Ahmet Ablak, Théo Chatreaux, Romain Malard
> **Version du document :** 1.0, 5 octobre 2026
> **Objectif de livraison :** application en production pour la **rentrée de septembre 2027**, avec l'ESTA comme établissement pilote
> **Destinataire principal :** Claude Code (développement), puis l'équipe projet (validation)

---

## 0. Mode d'emploi de ce document (pour Claude Code)

- Ce document est la **source de vérité** fonctionnelle. En cas de doute, appliquer la règle écrite ici. Si une règle manque, choisir l'option la plus simple et la noter dans `DECISIONS.md`.
- Chaque exigence a un identifiant (`F-ACT-03`, `NF-SEC-02`…) et une priorité **MoSCoW** :
  - **M** (Must) : obligatoire pour le lancement de septembre 2027
  - **S** (Should) : prévu en V1, mais peut glisser si le planning dérape
  - **C** (Could) : bonus si le temps le permet
  - **W** (Won't, V1) : explicitement hors périmètre V1
- Les éléments marqués **[HYPOTHÈSE]** sont des interprétations à faire valider par le groupe (liste en §16).
- Développer **par lots** dans l'ordre du §14. Chaque lot doit être testable de bout en bout avant de passer au suivant.
- Langue de l'interface : **français uniquement** en V1. Ton **décontracté, tutoiement** (voir §12).

---

## 1. Contexte et vision

### 1.1 Le problème
La solitude étudiante est un enjeu reconnu : **41 %** des étudiants se déclarent seuls, contre 19 % de la population générale (Le Figaro Étudiant / Cop1, 2024). La santé mentale était la Grande Cause Nationale 2025.

Notre enquête (Sphinx, mars–avril 2026, 65 étudiants, 5 établissements) montre :
- **24 %** des étudiants n'ont reçu **aucun accueil** à leur arrivée. Ceux-là ont **2,6 fois plus** de difficultés d'intégration.
- **49 %** ne participent **jamais ou rarement** aux événements. Le sentiment d'intégration progresse presque linéairement avec la participation (6,4/10 → 7,9/10).
- **67,7 %** sont intéressés par une application d'intégration sociale.
- **Le sport** est l'activité la plus demandée (60 %), devant le divertissement (45 %), le voyage (42 %) et l'événementiel (40 %).
- Facteurs d'adoption : **événements intéressants** (n°1), **simplicité d'usage** (n°2), **nombre d'utilisateurs** (n°3).
- **80 %** des établissements ne mesurent pas la cohésion de leurs étudiants, et **100 %** sont prêts à tester une solution pilote.

### 1.2 La solution
**UNION est une application mobile (iOS et Android) réservée aux étudiants d'un établissement.** Elle leur permet de **découvrir, créer et rejoindre des activités planifiées** (sport, sorties, soirées, révisions…), de se retrouver ensuite entre participants et d'être parrainés par un étudiant plus ancien.

**L'établissement est le client payant.** Il déploie UNION auprès de ses étudiants et accède en bonus à un **tableau de bord web anonymisé** qui mesure la vie sociale du campus (participation, sociabilité, engagement). Il peut aussi exporter ces données pour ses rapports RSE et ses accréditations.

### 1.3 Promesse
> **Étudiants :** « Trouve ta bande dès la rentrée : rejoins des activités près de chez toi avec des étudiants de ton école. »
> **Établissements :** « Mesurez et améliorez la vie sociale de votre campus, sans rien changer à vos outils actuels. »

### 1.4 Principes produit (non négociables)
1. **Le réel avant le virtuel :** toute la valeur se mesure en participations réelles à des activités.
2. **Simple :** un nouvel étudiant doit pouvoir rejoindre sa première activité en **moins de 3 minutes** après l'installation.
3. **Espace dédié et sûr :** uniquement des étudiants vérifiés de son école, sans lien avec les réseaux sociaux personnels.
4. **Jamais de flicage :** l'école ne voit **aucune donnée individuelle**, seulement des statistiques agrégées.

---

## 2. Décisions validées par le groupe

| # | Sujet | Décision |
|---|---|---|
| D1 | Cœur du produit | App étudiante centrée sur les activités. Le dashboard école est un **bonus** (priorité inférieure) |
| D2 | Type d'activités | **Planifiées** (date et heure fixées). Deux origines : **officielles** (école/ambassadeurs) et **étudiantes** (tout étudiant peut publier) |
| D3 | Finalité du document | Développement réel avec Claude Code. Livrable = **application fonctionnelle**, pas une maquette |
| D4 | Noms | Projet : *Nouveau Départ*. Application : **UNION** |
| D5 | Modèle économique | **L'école paie** (abonnement hors application). Gratuit pour l'étudiant, aucun paiement dans l'app |
| D6 | Accès | Uniquement via une école partenaire. **Pas d'inscription libre** |
| D7 | Cible | Tout établissement d'enseignement supérieur (post-bac), public ou privé, d'où une architecture **multi-écoles** dès la V1 |
| D8 | Pilote | **ESTA Belfort** |
| D9 | Inscription | Email de l'école, code de vérification reçu par mail, création du mot de passe |
| D10 | Âge | **18 ans minimum**, pas de mineurs |
| D11 | Langue | Français uniquement (V1) |
| D12 | Modération | **A posteriori** (publication immédiate, puis signalement et traitement) |
| D13 | Accueil / onboarding | **Pas de module « Premier pas »** : onboarding minimal |
| D14 | Matching | Basé sur la **participation commune aux activités** |
| D15 | Profil | Vrai nom, email étudiant, **photo facultative** |
| D16 | Gamification | Points, badges et **goodies à gagner** |
| D17 | Mentorat (parrainage) | **Inclus en V1** |
| D18 | « Besoin de parler » | Oui, bouton vers les ressources d'écoute |
| D19 | Calendrier | Ajout au calendrier du téléphone (Google Agenda / Apple Calendrier) |
| D20 | Carte | Simple carte des activités (pas de géolocalisation des étudiants) |
| D21 | Dashboard école | Tous les indicateurs proposés, **anonymisés uniquement**, export **PDF et Excel** |
| D22 | Détection d'isolement | **Non** |
| D23 | Notifications de l'école | Oui, limitées aux activités et annonces liées à l'application |
| D24 | Associations | **Pas d'espace dédié.** Une asso utilise un compte étudiant normal |
| D25 | Plateforme | **Vraie application mobile iOS et Android** |
| D26 | Développement | Aloïs, avec Claude Code |
| D27 | Hébergement | **Supabase** (offre gratuite pendant le développement et le pilote, offre payante au lancement officiel) |
| D28 | Intégrations externes (ENT, HelloAsso…) | Plus tard (hors V1) |
| D29 | Canaux de notification | **Push uniquement**. Aucun email marketing (seul l'email technique de vérification est envoyé) |
| D30 | Identité visuelle | Aucune charte existante : proposition libre (voir §12) |
| D31 | Ton | Décontracté, tutoiement |
| D32 | Échéance | **Prête pour la rentrée 2027** |

---

## 3. Périmètre

### 3.1 Dans la V1
- Application mobile étudiante (iOS et Android)
- Back-office web pour l'établissement (dashboard, annonces, goodies, modération, ressources)
- Back-office super-admin (création des écoles)
- Multi-écoles (une instance, plusieurs établissements cloisonnés)

### 3.2 Hors V1 (Won't)
- Inscription sans école partenaire, utilisateurs mineurs, langue anglaise
- Paiement dans l'application, billetterie, intégration HelloAsso
- Intégration ENT, SSO école, import de listes d'étudiants
- Emails (newsletters, récapitulatifs)
- Espace dédié aux associations
- Détection d'isolement, suivi individuel par l'école
- Géolocalisation en temps réel des étudiants (« qui est autour de moi »)
- Activités spontanées « maintenant » (seules les activités planifiées existent)
- Recommandations par IA

---

## 4. Utilisateurs et rôles

### 4.1 Rôles

| Rôle | Qui | Où | Description |
|---|---|---|---|
| **Étudiant** | Tout étudiant vérifié de l'école (y compris les membres d'associations) | App | Découvre, crée et rejoint des activités, discute, gagne des points |
| **Parrain** | Étudiant volontaire (2e année ou plus) | App | Attribut en plus du rôle étudiant : accompagne 1 à 3 filleuls nouveaux arrivants |
| **Ambassadeur** | Étudiant désigné par l'école (ex. membres du BDE, délégués) | App | **[HYPOTHÈSE H2]** Publie des activités **officielles**, traite les signalements (modération), valide les présences de toute activité |
| **Admin école** | Personnel de l'établissement (vie étudiante, pédagogie, communication) | Back-office web | Dashboard, annonces push, catalogue de goodies, ressources d'écoute, désignation des ambassadeurs, modération, suspension de comptes |
| **Super-admin** | L'équipe UNION | Back-office web | Création et configuration des écoles, création des admins école, supervision globale |

> **Note :** le « bureau d'asso » proposé au départ est supprimé en tant que rôle, puisque les associations utilisent un compte étudiant simple (D24). Une asso peut demander le statut ambassadeur à l'école pour publier en « officiel ».
>
> **Note :** « Parrain » est un **attribut** (`is_mentor`) et non un rôle exclusif : un ambassadeur peut aussi être parrain.

### 4.2 Personas

**Lucas, 18 ans, primo-entrant (cœur de cible).** Il arrive de Dijon en 1re année à l'ESTA et vit seul en résidence. Il ne connaît personne, les groupes semblent déjà formés et il n'ose pas aborder les autres. Il aime le foot et les jeux vidéo. *Ce qu'il attend :* une activité ce jeudi soir où il peut venir seul sans que ce soit bizarre.

**Inès, 21 ans, engagée peu visible.** En 3e année, elle est intégrée mais rate la moitié des événements faute d'information. *Ce qu'elle attend :* tout ce qui se passe sur le campus au même endroit, et pouvoir proposer une sortie escalade.

**Marc, 24 ans, parrain.** En Master 1 et au BDE, il se souvient de sa propre rentrée difficile. *Ce qu'il attend :* aider 2 ou 3 nouveaux sans y passer des heures, et publier les événements du BDE.

**Mme Durand, responsable vie étudiante.** Elle sait que l'isolement existe mais n'a aucun chiffre. Elle prépare le dossier DD&RS. *Ce qu'elle attend :* des indicateurs fiables, exportables, sans surveiller qui que ce soit.

### 4.3 Matrice des permissions

| Action | Étudiant | Parrain | Ambassadeur | Admin école | Super-admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Voir et rejoindre les activités de son école | ✅ | ✅ | ✅ | 👁 (back-office) | 👁 |
| Créer une activité étudiante | ✅ | ✅ | ✅ | — | — |
| Créer une activité **officielle** | — | — | ✅ | ✅ | — |
| Modifier/annuler **sa** propre activité | ✅ | ✅ | ✅ | ✅ | — |
| Masquer/supprimer **n'importe quelle** activité | — | — | ✅ | ✅ | ✅ |
| Valider les présences de sa propre activité | ✅ (organisateur) | ✅ | ✅ | — | — |
| Valider les présences de toute activité | — | — | ✅ | — | — |
| Envoyer des messages privés | ✅ | ✅ | ✅ | — | — |
| Signaler un contenu ou un utilisateur | ✅ | ✅ | ✅ | — | — |
| Traiter les signalements | — | — | ✅ | ✅ | ✅ |
| Suspendre un compte | — | — | — | ✅ | ✅ |
| Envoyer une annonce push à toute l'école | — | — | — | ✅ | — |
| Gérer goodies, ressources, ambassadeurs | — | — | — | ✅ | — |
| Voir le dashboard et exporter | — | — | — | ✅ | ✅ |
| Créer une école ou un admin école | — | — | — | — | ✅ |

---

## 5. Parcours utilisateurs clés

### P1 — Première connexion (cible : moins de 3 minutes jusqu'à la première activité)
1. Télécharge UNION → écran d'accueil (« Bienvenue sur UNION, trouve ta bande »)
2. Saisit son **email étudiant** → l'app reconnaît l'école grâce au domaine (ex. `@esta-groupe.fr`). Si le domaine est inconnu, message : « Ton école n'est pas encore sur UNION. Parle-en à ton BDE ! »
3. Reçoit un **code à 6 chiffres** par email → le saisit
4. Crée son **mot de passe**
5. Renseigne : prénom, nom, date de naissance (refus si moins de 18 ans), formation, année d'études, case « Je suis nouveau dans l'établissement cette année »
6. Facultatif : photo, 3 à 5 centres d'intérêt (catégories d'activités)
7. Accepte les CGU et la politique de confidentialité
8. Autorise les notifications push (avec explication préalable)
9. Si nouveau arrivant et mentorat activé par l'école : « Tu veux un parrain pour t'aider à démarrer ? » → Oui / Plus tard
10. Arrive sur le **fil des activités**, avec les activités à venir en premier

### P2 — Rejoindre une activité
Fil ou carte → fiche activité → **« Je participe »** → inscription confirmée, ajout automatique au groupe de discussion de l'activité, proposition « Ajouter à mon calendrier » → rappel push la veille et 1 h avant → le jour J, **check-in** (scan du QR code de l'organisateur) → points crédités → les participants apparaissent dans « Mes rencontres ».

### P3 — Créer une activité
Bouton **« + »** → titre, catégorie, date et heure de début et de fin, lieu (adresse ou point sur la carte), description, nombre de places max (facultatif), photo de couverture (facultative) → publication immédiate (modération a posteriori) → l'organisateur est inscrit automatiquement.

### P4 — Parrainage
Le filleul demande un parrain → le système propose le meilleur parrain disponible (même formation, puis centres d'intérêt communs, puis moins de filleuls) → le parrain accepte ou refuse (délai de 72 h, sinon passage au suivant) → une conversation privée parrain–filleul s'ouvre avec un message d'accueil automatique.

### P5 — Admin école
Connexion au back-office web → dashboard (période, formation, année) → export PDF ou Excel → création d'une annonce push liée à un événement → gestion du stock de goodies et des retraits.

---

## 6. Spécifications fonctionnelles — application mobile

### 6.1 Authentification et compte (AUTH)

| ID | Prio | Exigence |
|---|---|---|
| F-AUTH-01 | M | L'inscription n'accepte que les emails dont le domaine figure dans `schools.email_domains` d'une école active. Comparaison insensible à la casse |
| F-AUTH-02 | M | Vérification de l'email par **code OTP à 6 chiffres** envoyé par mail (valide 10 min, 5 essais max, renvoi possible après 60 s) |
| F-AUTH-03 | M | Création du mot de passe après vérification : 8 caractères minimum, dont au moins une lettre et un chiffre |
| F-AUTH-04 | M | La date de naissance est obligatoire. Âge inférieur à 18 ans : création refusée, message bienveillant, aucune donnée conservée |
| F-AUTH-05 | M | Acceptation explicite des CGU et de la politique de confidentialité (horodatée) |
| F-AUTH-06 | M | Connexion email + mot de passe. Session persistante (pas de reconnexion à chaque ouverture) |
| F-AUTH-07 | M | « Mot de passe oublié » : code OTP par email, puis nouveau mot de passe |
| F-AUTH-08 | M | **Suppression du compte depuis l'app** (obligatoire pour l'App Store) : anonymisation du profil, suppression de la photo, messages affichés comme « Utilisateur supprimé » |
| F-AUTH-09 | M | Un compte suspendu par l'école ne peut plus se connecter. Message : « Ton compte a été suspendu, contacte ton école » |
| F-AUTH-10 | S | Export de mes données (RGPD) : fichier JSON envoyé via la feuille de partage du téléphone |

### 6.2 Profil (PROF)

| ID | Prio | Exigence |
|---|---|---|
| F-PROF-01 | M | Champs : prénom, nom (**vrai nom**, D15), formation, année d'études, photo (facultative, recadrage carré, 5 Mo max), bio courte (facultative, 150 caractères), centres d'intérêt (facultatif, parmi les catégories) |
| F-PROF-02 | M | Profil public visible des autres étudiants **de la même école uniquement** : photo, prénom, nom, formation, année, bio, centres d'intérêt, badges, nombre d'activités réalisées. **Jamais** : email, date de naissance, points, historique détaillé |
| F-PROF-03 | M | Sans photo, un avatar généré avec les initiales et une couleur |
| F-PROF-04 | M | Modification du profil à tout moment (sauf email et école) |
| F-PROF-05 | M | Badge visible « Parrain » ou « Ambassadeur » sur le profil |
| F-PROF-06 | M | Depuis un profil : envoyer un message, **bloquer**, **signaler** |

### 6.3 Activités (ACT) — module central

**Catégories (liste fixe en V1) :** Sport ⚽ · Sorties & divertissement 🎳 · Soirées & événements 🎉 · Voyages & week-ends 🧳 · Culture 🎭 · Révisions & entraide 📚 · Repas & cafés ☕ · Jeux 🎲 · Autre ✨

| ID | Prio | Exigence |
|---|---|---|
| F-ACT-01 | M | Création par tout étudiant. Champs obligatoires : titre (5 à 80 caractères), catégorie, date et heure de début, lieu. Champs facultatifs : heure de fin (défaut : début + 2 h), description (1 000 caractères max), places max (2 à 500, vide = illimité), photo de couverture |
| F-ACT-02 | M | Date de début entre maintenant + 30 min et maintenant + 6 mois |
| F-ACT-03 | M | Lieu : saisie d'adresse avec autocomplétion **ou** épingle sur la carte. On stocke le nom du lieu, l'adresse et les coordonnées |
| F-ACT-04 | M | **Publication immédiate**, sans validation préalable (D12) |
| F-ACT-05 | M | Les ambassadeurs et admins école peuvent cocher **« Officielle »** : badge distinctif, mise en avant en haut du fil |
| F-ACT-06 | M | Bouton **« Je participe »** : inscription. Si complet : **liste d'attente** avec promotion automatique au premier désistement (et push « Une place s'est libérée, tu es inscrit ! ») |
| F-ACT-07 | M | **Désinscription** possible jusqu'au début de l'activité |
| F-ACT-08 | M | La fiche activité affiche : couverture, titre, catégorie, badge officiel, date et heure, lieu (mini-carte + bouton « Itinéraire » qui ouvre Plans ou Google Maps), organisateur, description, places restantes, **avatars des participants** (liste complète au clic), bouton de participation |
| F-ACT-09 | M | L'organisateur peut **modifier** son activité (les inscrits sont notifiés si la date, l'heure ou le lieu changent) et l'**annuler** (tous les inscrits sont notifiés) |
| F-ACT-10 | M | **Check-in (validation de présence)** **[HYPOTHÈSE H4]** : de 30 min avant le début à 2 h après la fin, l'organisateur affiche un **QR code** dynamique dans l'app, que les participants scannent. Alternative : l'organisateur coche manuellement les présents. **La présence validée est la seule donnée qui compte pour les points, le dashboard et « Mes rencontres ».** |
| F-ACT-11 | M | Une activité passée reste consultable dans « Mon historique » |
| F-ACT-12 | S | Partage d'une activité par lien (deep link `union://activity/{id}`). Hors de l'app, le lien mène à une page « Télécharge UNION » |
| F-ACT-13 | S | Dupliquer une activité passée (« Refaire cette activité ») |
| F-ACT-14 | C | Activité récurrente (chaque semaine, pendant N semaines) |

### 6.4 Découverte : fil, filtres et carte (DISC)

| ID | Prio | Exigence |
|---|---|---|
| F-DISC-01 | M | **Fil « À venir »** (onglet d'accueil) : activités futures de mon école, triées par date. En tête, une section « ⭐ Officiel cette semaine » |
| F-DISC-02 | M | **Filtres** : catégorie (multi-choix), période (aujourd'hui / cette semaine / ce week-end / ce mois), « Places disponibles », « Officielles uniquement » |
| F-DISC-03 | M | Recherche texte (titre, description, lieu) |
| F-DISC-04 | M | **Carte** (D20) : épingles des activités à venir, colorées par catégorie. Au tap, mini-fiche puis fiche complète. Centrage par défaut sur le campus de l'école. Les mêmes filtres s'appliquent |
| F-DISC-05 | M | La carte ne montre **jamais** la position des étudiants. La position de l'utilisateur sert seulement, avec son autorisation, à centrer la carte sur lui |
| F-DISC-06 | S | Section **« Pour toi »** (voir 6.6) en haut du fil |
| F-DISC-07 | M | État vide engageant : « Rien de prévu pour l'instant… Et si c'était toi qui lançais le premier foot ? » + bouton Créer |

### 6.5 Calendrier (CAL)

| ID | Prio | Exigence |
|---|---|---|
| F-CAL-01 | M | Onglet **« Mon agenda »** : mes activités à venir (inscrit ou organisateur), en liste par jour |
| F-CAL-02 | M | Bouton **« Ajouter à mon calendrier »** : ajout de l'événement au calendrier natif du téléphone (synchronisé avec Google Agenda ou iCloud selon le compte du téléphone). Titre, lieu, heures, lien vers l'activité |
| F-CAL-03 | S | Mise à jour de l'événement du calendrier si l'activité est modifiée (si l'app a gardé l'identifiant de l'événement) ; sinon, le push de modification le signale |
| F-CAL-04 | C | Option « Ajouter automatiquement mes activités à mon calendrier » |

### 6.6 Matching par participation (MATCH) — D14

Le principe : **on ne propose pas des « profils compatibles » mais des personnes réellement croisées et des activités où les retrouver.**

| ID | Prio | Exigence |
|---|---|---|
| F-MATCH-01 | M | **« Mes rencontres »** : liste des étudiants avec qui j'ai **une présence validée en commun** dans au moins une activité. Tri par nombre d'activités partagées, puis par date de la dernière. Chaque ligne indique « 3 activités ensemble · dernière : Foot jeudi » |
| F-MATCH-02 | M | Depuis « Mes rencontres » : voir le profil, envoyer un message |
| F-MATCH-03 | S | **Recommandations d'activités (« Pour toi »)**, calculées par un score simple : +3 si une personne de « Mes rencontres » est inscrite, +2 si la catégorie fait partie de mes catégories fréquentes (historique) ou de mes centres d'intérêt, +1 si l'activité est dans les 7 prochains jours, +1 si officielle. Les 5 meilleures sont affichées |
| F-MATCH-04 | S | Sur la fiche activité : « 👋 2 personnes que tu as rencontrées y vont » |
| F-MATCH-05 | M | Les personnes **bloquées** n'apparaissent jamais dans « Mes rencontres » ni dans les recommandations |

### 6.7 Messagerie (CHAT)

**[HYPOTHÈSE H1]** Nous interprétons la réponse « que la 2 » comme : **messages privés entre étudiants en plus des discussions de groupe liées aux activités.**

| ID | Prio | Exigence |
|---|---|---|
| F-CHAT-01 | M | **Discussion de groupe par activité**, créée automatiquement. Membres : l'organisateur et les inscrits. Un désinscrit quitte la discussion. Lecture seule 7 jours après l'activité, archivage à 30 jours |
| F-CHAT-02 | M | **Messages privés** 1-à-1 entre étudiants de la **même école** |
| F-CHAT-03 | M | Texte et emojis. Pas d'images ni de vocaux en V1 (moins de risques de modération). 2 000 caractères max par message |
| F-CHAT-04 | M | Temps réel (le message apparaît sans rafraîchir), indicateur de non-lu, liste des conversations triée par dernier message |
| F-CHAT-05 | M | **Bloquer** un utilisateur : il ne peut plus m'écrire en privé, et nous ne nous voyons plus dans les listes. Il n'est pas prévenu |
| F-CHAT-06 | M | **Signaler** un message (appui long) |
| F-CHAT-07 | M | Push à chaque nouveau message (regroupés, et respect du mode silencieux par conversation) |
| F-CHAT-08 | S | Premier message privé à un inconnu (hors « Mes rencontres », hors parrain/filleul) : rappel des règles de bienveillance |
| F-CHAT-09 | S | Filtre basique d'insultes : liste de mots, message envoyé mais marqué pour revue automatique |
| F-CHAT-10 | W | Messages vocaux, images, réactions, groupes privés libres |

### 6.8 Parrainage / mentorat (MENT) — D17

| ID | Prio | Exigence |
|---|---|---|
| F-MENT-01 | M | Fonction activable ou désactivable par école (`schools.settings.mentoring_enabled`, activée par défaut) |
| F-MENT-02 | M | **Devenir parrain** : depuis le profil, tout étudiant en 2e année ou plus peut se porter volontaire (charte du parrain à accepter). Il indique sa capacité : 1, 2 ou 3 filleuls |
| F-MENT-03 | M | **Demander un parrain** : proposé à l'onboarding aux nouveaux arrivants, puis disponible à tout moment depuis le profil |
| F-MENT-04 | M | **Attribution automatique** : parrains disponibles de la même école, avec un score : même formation +3, même année cible +1, centre d'intérêt commun +1 chacun. Départage par le moins de filleuls actifs |
| F-MENT-05 | M | Le parrain reçoit un push et accepte ou refuse sous 72 h. Sans réponse ou en cas de refus, on passe au suivant. Sans parrain disponible : « On te trouve un parrain dès qu'un volontaire est dispo » (file d'attente) |
| F-MENT-06 | M | À l'acceptation : conversation privée ouverte automatiquement, avec un message d'accueil généré (« Salut Lucas ! Je suis Marc, ton parrain… ») |
| F-MENT-07 | M | Le parrain ou le filleul peut **mettre fin** au parrainage à tout moment, sans justification |
| F-MENT-08 | S | Le parrain voit les activités à venir auxquelles son filleul est inscrit, et inversement (« Lucas va au Foot jeudi, tu viens ? ») |
| F-MENT-09 | S | Durée par défaut : 1 an universitaire, avec une proposition de renouvellement |

### 6.9 Gamification et goodies (GAME) — D16

**Barème des points par défaut** (configurable par école) :

| Action | Points | Condition anti-abus |
|---|---|---|
| Présence validée à une activité | +10 | Une fois par activité |
| Première activité de ma vie sur UNION | +15 bonus | Une seule fois |
| Organiser une activité avec au moins 3 présences validées (hors organisateur) | +20 | — |
| Découvrir une nouvelle catégorie | +5 | Une fois par catégorie |
| Parrain et filleul présents à la même activité | +15 chacun | Une fois par mois et par binôme |
| Accepter un filleul | +10 | — |
| **Plafond** | **60 points/jour** | — |

| ID | Prio | Exigence |
|---|---|---|
| F-GAME-01 | M | Points crédités **uniquement** sur des présences validées (pas de points pour une simple inscription). Chaque mouvement est tracé dans `point_transactions` |
| F-GAME-02 | M | Écran **« Mes points »** : solde, historique, prochain badge |
| F-GAME-03 | M | **Badges** (voir liste ci-dessous) avec animation de déblocage |
| F-GAME-04 | M | **Boutique de goodies** : catalogue géré par l'école (nom, photo, description, coût en points, stock). L'étudiant échange ses points et obtient un **code de retrait** à présenter (ex. au BDE). L'admin marque le goodie « remis » dans le back-office |
| F-GAME-05 | M | Les points dépensés sont débités immédiatement. Une annulation par l'admin rembourse les points |
| F-GAME-06 | S | Classement **non public** : seulement « Tu fais partie des 20 % les plus actifs de ton école ». **Pas de classement nominatif**, pour ne pas exclure ceux qui démarrent |

**Badges V1 :** 🌱 *Premier pas* (1re activité) · 🧭 *Explorateur* (4 catégories différentes) · ⚽ *Sportif* (5 activités Sport) · 🎤 *Organisateur* (3 activités organisées réussies) · 🤝 *Parrain* (premier filleul accepté) · 🏛 *Pilier* (20 activités) · 🔥 *Régulier* (au moins 1 activité par semaine pendant 4 semaines)

### 6.10 Notifications push (NOTIF) — D29

| ID | Prio | Notification | Destinataire |
|---|---|---|---|
| F-NOTIF-01 | M | Rappel : « Ton activité X commence demain à 18h » (J-1, 18h) et « dans 1 h » | Inscrits |
| F-NOTIF-02 | M | Activité modifiée ou annulée | Inscrits |
| F-NOTIF-03 | M | Une place s'est libérée (liste d'attente) | Promu |
| F-NOTIF-04 | M | Nouveau message (privé / groupe) | Destinataires |
| F-NOTIF-05 | M | Parrainage : demande reçue, accepté, nouveau filleul | Concernés |
| F-NOTIF-06 | M | Annonce de l'école (envoyée depuis le back-office) | Toute l'école ou un filtre formation/année |
| F-NOTIF-07 | M | Badge débloqué, goodie prêt | Concerné |
| F-NOTIF-08 | S | Quelqu'un de « Mes rencontres » organise une activité | Rencontres |
| F-NOTIF-09 | S | Relance douce si aucune activité depuis 14 jours : « 3 activités Sport cette semaine, ça te dit ? » (1 fois par mois maximum) | Inactifs |

Exigences transverses :
- **F-NOTIF-10 (M)** : l'utilisateur règle chaque type de notification dans *Réglages → Notifications*.
- **F-NOTIF-11 (M)** : au tap, la notification ouvre l'écran concerné (deep link).
- **F-NOTIF-12 (M)** : pas d'envoi entre 22h et 8h, sauf messages privés et rappels « dans 1 h ».

### 6.11 « Besoin de parler » (HELP) — D18

| ID | Prio | Exigence |
|---|---|---|
| F-HELP-01 | M | Bouton **« Besoin de parler ? 💬 »** toujours accessible (onglet Profil + menu) |
| F-HELP-02 | M | L'écran affiche : 1) les **ressources de l'école** configurées par l'admin (cellule d'écoute, infirmerie, référent bien-être : horaires, téléphone, lieu, lien) ; 2) des **ressources nationales** pré-remplies **(numéros à vérifier avant la mise en production)** : 3114 (prévention du suicide, 24h/24), Fil Santé Jeunes (0 800 235 236), dispositif Santé Psy Étudiant, Nightline ; 3) en cas d'urgence : 15 / 112 |
| F-HELP-03 | M | Boutons « Appeler » et « Ouvrir le site » directs |
| F-HELP-04 | M | **Aucune donnée individuelle enregistrée** sur la consultation de cet écran. L'école ne sait pas qui l'a ouvert |
| F-HELP-05 | M | Ton sobre et bienveillant sur cet écran (pas d'emoji festif, pas de gamification) |

### 6.12 Modération et sécurité des contenus (MOD) — D12

| ID | Prio | Exigence |
|---|---|---|
| F-MOD-01 | M | **Signaler** une activité, un message ou un utilisateur. Motifs : contenu inapproprié, harcèlement, spam, faux profil, danger, autre (+ commentaire) |
| F-MOD-02 | M | **Masquage automatique** d'un contenu dès **3 signalements distincts**, en attendant la revue |
| F-MOD-03 | M | **File de modération** accessible aux ambassadeurs (dans l'app) et aux admins école (back-office) : voir le contenu, puis *Rejeter le signalement* / *Masquer / supprimer le contenu* / *Avertir l'utilisateur* |
| F-MOD-04 | M | L'admin école peut **suspendre** un compte (temporairement ou définitivement) |
| F-MOD-05 | M | Le signaleur reçoit un retour : « Merci, ton signalement a été traité » |
| F-MOD-06 | M | **Charte de bonne conduite** acceptée à l'inscription et consultable à tout moment |
| F-MOD-07 | M | Un ambassadeur ne peut pas traiter un signalement qui le concerne |

> Ces exigences couvrent aussi les obligations des stores pour les applications à contenu généré par les utilisateurs : signaler, bloquer, modérer, et un contact d'assistance (voir NF-STORE).

---

## 7. Spécifications fonctionnelles — back-office web

Application web responsive, accessible aux admins école et au super-admin. **Priorité globale : S (bonus, D1)**, sauf la gestion minimale de l'école, qui est M car nécessaire au pilote.

### 7.1 Gestion de l'école (ADM)

| ID | Prio | Exigence |
|---|---|---|
| F-ADM-01 | M | Connexion admin (email + mot de passe), comptes créés par le super-admin |
| F-ADM-02 | M | Paramètres de l'école : nom, logo, adresse du campus (centre de la carte), domaines email autorisés (lecture seule pour l'admin, modifiables par le super-admin), effectif déclaré, activation du mentorat, barème des points |
| F-ADM-03 | M | **Gestion des ambassadeurs** : recherche d'un étudiant par nom ou email, puis attribution ou retrait du rôle |
| F-ADM-04 | M | **Ressources « Besoin de parler »** : CRUD (nom, description, téléphone, lien, horaires, ordre) |
| F-ADM-05 | M | **File de modération** et suspension de comptes (cf. F-MOD) |
| F-ADM-06 | S | **Boutique de goodies** : CRUD des articles, stock, liste des demandes, bouton « Remis », annulation avec remboursement |
| F-ADM-07 | S | **Annonces push** : titre (50 caractères), message (180 caractères), lien facultatif vers une activité, cible (toute l'école / formation / année). Maximum **3 annonces par semaine** pour éviter le spam. Historique des envois |
| F-ADM-08 | S | Création d'**activités officielles** depuis le back-office |

### 7.2 Dashboard (DASH) — D21

**Règle d'or : tout indicateur est agrégé. Tout segment de moins de 5 étudiants affiche « < 5, donnée masquée » (seuil de k-anonymat).** Aucun écran ne liste des étudiants nominativement avec leur activité.

Filtres globaux : période (7 j / 30 j / semestre / année / personnalisée), formation, année d'études.

| ID | Prio | Indicateur | Définition (à respecter exactement) |
|---|---|---|---|
| F-DASH-01 | S | **Étudiants inscrits** et **taux d'adoption** | Comptes actifs / effectif déclaré de l'école |
| F-DASH-02 | S | **Étudiants actifs** (7 j / 30 j) | Ont ouvert l'app au moins une fois sur la période |
| F-DASH-03 | S | **Taux d'engagement** | % des inscrits avec **au moins 1 présence validée** sur la période |
| F-DASH-04 | S | **Indice de sociabilité** ⭐ | Nombre moyen de **personnes distinctes rencontrées** (co-présence validée) par étudiant engagé sur la période. Affiché avec son évolution |
| F-DASH-05 | S | **Taux de sociabilité** | % des inscrits ayant rencontré **au moins 3 personnes distinctes** sur la période |
| F-DASH-06 | S | **Nombre d'activités** | Total, officielles / étudiantes, par catégorie (graphique) |
| F-DASH-07 | S | **Taux de participation** | Présences validées / inscriptions, sur les activités terminées |
| F-DASH-08 | S | **Taux de remplissage** | Inscrits / places max (activités avec limite) |
| F-DASH-09 | S | **Nouveaux arrivants** | % des nouveaux arrivants avec au moins 1 présence dans leurs 30 premiers jours (indicateur clé de l'enquête) |
| F-DASH-10 | S | **Parrainage** | Binômes actifs, demandes en attente, parrains volontaires |
| F-DASH-11 | S | **Engagement par formation / année** | Taux d'engagement par segment (seuil de 5) |
| F-DASH-12 | S | **Score d'intégration déclaré** | Moyenne du mini-sondage (voir F-SURV) : à l'inscription vs à J+60 |
| F-DASH-13 | S | **Évolution temporelle** | Courbes hebdomadaires des indicateurs 3, 4 et 6 |
| F-DASH-14 | S | **Export Excel** (.xlsx) : un onglet par indicateur, avec les données agrégées et la période |
| F-DASH-15 | S | **Export PDF** : rapport mis en page (logo de l'école, période, indicateurs clés, graphiques, définitions des indicateurs), prêt pour un dossier RSE ou DD&RS |

### 7.3 Mini-sondage d'intégration (SURV)

| ID | Prio | Exigence |
|---|---|---|
| F-SURV-01 | S | **[HYPOTHÈSE H9]** Question facultative : « Sur 10, comment tu te sens intégré(e) dans ton école ? », posée à l'inscription puis à J+60. Bouton « Passer » toujours visible |
| F-SURV-02 | S | Réponses utilisées **uniquement en agrégé** (F-DASH-12). Elles servent à prouver l'impact d'UNION, en lien avec la méthodologie de l'étude de marché |

### 7.4 Super-admin (SUP)

| ID | Prio | Exigence |
|---|---|---|
| F-SUP-01 | M | CRUD des écoles (nom, domaines email, effectif, statut actif ou inactif, date de fin d'abonnement) |
| F-SUP-02 | M | Création des comptes admin école (invitation par email) |
| F-SUP-03 | S | Vue globale : nombre d'écoles, d'utilisateurs, d'activités |
| F-SUP-04 | M | Une école **inactive** (abonnement terminé) bloque les nouvelles inscriptions et affiche un message aux étudiants. Les données sont conservées 6 mois puis supprimées |

---

## 8. Exigences non fonctionnelles

### 8.1 Performance et qualité
- **NF-PERF-01 (M)** : ouverture de l'app et affichage du fil en moins de 2 s en 4G (pagination de 20 éléments).
- **NF-PERF-02 (M)** : envoi d'un message en moins d'1 s (temps réel).
- **NF-PERF-03 (M)** : fonctionne de façon dégradée hors connexion (affichage en cache du fil et de l'agenda, message « Pas de connexion »).
- **NF-QUAL-01 (M)** : compatibilité iOS 16+ et Android 10+.
- **NF-QUAL-02 (S)** : accessibilité : tailles de police système respectées, contrastes AA, libellés pour lecteurs d'écran.
- **NF-QUAL-03 (M)** : tests automatisés sur les règles critiques (inscription par domaine, âge, liste d'attente, points, k-anonymat, RLS).

### 8.2 Sécurité
- **NF-SEC-01 (M)** : **cloisonnement strict par école** via les *Row Level Security* (RLS) Supabase. Un étudiant ne peut lire aucune donnée d'une autre école, même en appelant l'API directement.
- **NF-SEC-02 (M)** : aucune clé secrète (service role) dans l'application mobile. Les opérations sensibles (points, check-in, attribution des parrains, stats du dashboard, envoi des push) passent par des **Edge Functions** ou des fonctions SQL `security definer`.
- **NF-SEC-03 (M)** : QR code de check-in signé et à durée de vie courte (rotation toutes les 60 s), pour empêcher la triche par capture d'écran partagée.
- **NF-SEC-04 (M)** : limitation de débit : 10 activités créées par jour et par utilisateur, 30 messages par minute, 20 signalements par jour.
- **NF-SEC-05 (M)** : mots de passe gérés par Supabase Auth (jamais stockés en clair), HTTPS partout.

### 8.3 RGPD et données personnelles
- **NF-RGPD-01 (M)** : hébergement des données en **Union européenne** (projet Supabase créé dans une région UE).
- **NF-RGPD-02 (M)** : documents à produire : **politique de confidentialité**, **CGU**, **charte de bonne conduite**, **registre des traitements**, **contrat de sous-traitance (DPA)** avec chaque école. UNION est sous-traitant de l'école pour le dashboard **[à valider juridiquement]**.
- **NF-RGPD-03 (M)** : minimisation : aucune donnée sensible collectée (santé, religion…). La date de naissance sert uniquement au contrôle des 18 ans.
- **NF-RGPD-04 (M)** : durées de conservation : compte inactif depuis 24 mois → anonymisation automatique ; messages supprimés 12 mois après la fin de la conversation ; données de l'école supprimées 6 mois après la fin du contrat.
- **NF-RGPD-05 (M)** : droits : accès / export (F-AUTH-10), rectification (profil), suppression (F-AUTH-08).
- **NF-RGPD-06 (M)** : géolocalisation de l'utilisateur jamais stockée côté serveur.

### 8.4 Exigences des stores (NF-STORE)
- **NF-STORE-01 (M)** : suppression du compte dans l'app (Apple).
- **NF-STORE-02 (M)** : contenu généré par les utilisateurs : signalement, blocage, modération et contact d'assistance visibles (Apple, règle 1.2).
- **NF-STORE-03 (M)** : comptes de démonstration pour les équipes de revue Apple et Google (école de test `@demo.union-app.fr`).
- **NF-STORE-04 (M)** : textes de demande d'autorisation clairs (notifications, localisation, appareil photo pour le QR, calendrier).
- **NF-STORE-05 (M)** : politique de confidentialité hébergée en ligne (URL publique) et page de support.

---

## 9. Architecture technique

### 9.1 Choix de la stack

| Couche | Choix | Pourquoi |
|---|---|---|
| App mobile | **React Native + Expo (SDK récent) + TypeScript**, navigation **Expo Router** | Un seul code pour iOS et Android, très bien maîtrisé par Claude Code, builds cloud sans Mac via **EAS Build** |
| UI | Composants maison + **NativeWind** (Tailwind pour React Native) | Rapide, cohérent avec le back-office |
| État / données | **TanStack Query** + client **supabase-js** | Cache, hors connexion léger, rafraîchissement |
| Backend | **Supabase** : Postgres, Auth (OTP email + mot de passe), Storage (photos), Realtime (chat), Edge Functions (logique sensible), Cron (`pg_cron`, pour rappels et nettoyage) | Gratuit pour démarrer (D27), tout-en-un |
| Push | **Expo Notifications** (service Expo Push, qui gère APNs et FCM) | Simple, gratuit |
| Carte | **react-native-maps** (Apple Maps sur iOS, Google Maps sur Android) | Standard Expo. Une clé API Google Maps est nécessaire pour Android |
| Lieux / adresses | Autocomplétion via l'**API Adresse (BAN, data.gouv.fr)**, gratuite et adaptée à la France | Pas de coût Google Places |
| Calendrier | **expo-calendar** | Écrit dans le calendrier natif (Google ou iCloud selon le téléphone) |
| QR code | `react-native-qrcode-svg` (affichage) + **expo-camera** (scan) | — |
| Back-office web | **Next.js + TypeScript + Tailwind**, graphiques **Recharts**, export Excel **SheetJS (xlsx)**, export PDF **@react-pdf/renderer** | Même langage que l'app |
| Hébergement web | Vercel ou Cloudflare Pages (vérifier les conditions d'usage commercial au lancement payant) | — |
| Monitoring | **Sentry** (offre gratuite) | Crashs en production |

### 9.2 Organisation du dépôt (monorepo simple)

```
union/
├── CLAUDE.md                 # règles du projet pour Claude Code
├── DECISIONS.md              # journal des décisions prises en cours de dev
├── docs/
│   └── UNION_Cahier_des_specifications.md   # ce document
├── apps/
│   ├── mobile/               # Expo (étudiants)
│   └── admin/                # Next.js (back-office école + super-admin)
├── packages/
│   └── shared/               # types TypeScript générés depuis Supabase, constantes (catégories, barème, badges)
└── supabase/
    ├── migrations/           # schéma SQL versionné
    ├── functions/            # Edge Functions
    └── seed.sql              # données de test (école ESTA + école démo)
```

### 9.3 Environnements
- **dev** : projet Supabase gratuit + Expo Go / development build
- **pilote** : même projet ou un second projet gratuit. Distribution par **TestFlight** (iOS) et **test interne Google Play**
- **prod** : Supabase payant (D27) + publication sur l'App Store et Google Play

> ⚠️ **Points d'attention coûts et délais**
> - Compte **Apple Developer** : 99 $/an. Compte **Google Play Console** : 25 $ une seule fois. Les deux sont nécessaires pour publier.
> - Un projet Supabase gratuit est **mis en pause après une période d'inactivité** : à surveiller pendant le pilote, ou passer en payant dès l'ouverture aux étudiants.
> - La validation par Apple peut prendre plusieurs jours, avec des refus possibles : soumettre **au plus tard en juin 2027**.

---

## 10. Modèle de données (Postgres / Supabase)

Conventions : `id uuid default gen_random_uuid()`, `created_at timestamptz default now()`, noms de tables en anglais, **toutes les tables métier portent `school_id`** pour le cloisonnement RLS.

```sql
-- ÉCOLES
schools (
  id, name, slug unique, logo_url,
  email_domains text[] not null,          -- ex: {'esta-groupe.fr'}
  campus_address, campus_lat, campus_lng,
  declared_student_count int,
  is_active bool default true,
  subscription_ends_at date,
  settings jsonb default '{"mentoring_enabled":true,"points":{...}}',
  created_at
)

-- PROFILS (1-1 avec auth.users)
profiles (
  id uuid primary key references auth.users,
  school_id references schools not null,
  first_name, last_name, email,
  birth_date date not null,               -- contrôle 18+ (check)
  program text,                           -- formation
  study_year smallint,                    -- 1..8
  is_newcomer bool default false,
  bio varchar(150), avatar_url,
  interests text[],                       -- codes catégories
  role text check (role in ('student','ambassador','school_admin','super_admin')) default 'student',
  is_mentor bool default false,
  mentor_capacity smallint default 0,     -- 0..3
  points_balance int default 0,           -- maj uniquement par fonction serveur
  status text check (status in ('active','suspended','deleted')) default 'active',
  notification_prefs jsonb,
  cgu_accepted_at timestamptz not null,
  last_seen_at timestamptz,
  created_at
)

push_tokens (id, user_id, token unique, platform, created_at)

-- ACTIVITÉS
activities (
  id, school_id, creator_id references profiles,
  title, description, category text,      -- code catégorie
  is_official bool default false,
  starts_at, ends_at timestamptz,
  location_name, address, lat, lng,
  max_participants int null,
  cover_url,
  status text check (status in ('published','cancelled','hidden')) default 'published',
  checkin_secret text,                    -- pour QR signé (jamais exposé aux participants)
  created_at, updated_at
)

activity_participants (
  activity_id, user_id,
  status text check (status in ('registered','waitlisted','cancelled')),
  waitlist_position int null,
  checked_in_at timestamptz null,         -- présence validée
  checkin_method text null,               -- 'qr' | 'manual'
  created_at,
  primary key (activity_id, user_id)
)

-- RENCONTRES (dérivé, mis à jour au check-in, sert au matching + dashboard)
encounters (
  school_id, user_a, user_b,              -- user_a < user_b
  shared_count int, last_activity_id, last_met_at,
  primary key (user_a, user_b)
)

-- MESSAGERIE
conversations (id, school_id, type check in ('activity','direct','mentorship'), activity_id null, created_at, archived_at)
conversation_members (conversation_id, user_id, last_read_at, muted bool, primary key(...))
messages (id, conversation_id, sender_id, content varchar(2000), flagged bool default false, created_at, deleted_at)
blocks (blocker_id, blocked_id, created_at, primary key(...))

-- MODÉRATION
reports (
  id, school_id, reporter_id,
  target_type check in ('activity','message','user'), target_id uuid,
  reason text, comment text,
  status check in ('open','dismissed','actioned') default 'open',
  handled_by, handled_at, created_at,
  unique (reporter_id, target_type, target_id)
)

-- PARRAINAGE
mentorships (
  id, school_id, mentor_id, mentee_id,
  status check in ('requested','proposed','active','ended','declined'),
  proposed_at, accepted_at, ended_at, created_at
)

-- GAMIFICATION
point_transactions (id, school_id, user_id, amount int, reason text, ref_id uuid, created_at)
badges (code primary key, name, description, icon)          -- seed fixe
user_badges (user_id, badge_code, earned_at, primary key(...))
rewards (id, school_id, name, description, image_url, cost_points int, stock int, is_active bool)
reward_redemptions (id, school_id, reward_id, user_id, status check in ('pending','delivered','cancelled'), pickup_code varchar(6), created_at, delivered_at)

-- ÉCOLE
announcements (id, school_id, author_id, title, body, activity_id null, target jsonb, sent_at, recipients_count)
support_resources (id, school_id null, name, description, phone, url, hours, sort_order)   -- school_id null = ressource nationale
integration_surveys (id, school_id, user_id, wave check in ('signup','d60'), score smallint check 1..10, program, study_year, created_at)
```

**Fonctions serveur clés** (Edge Functions ou RPC `security definer`) :
- `check_school_domain(email)` : renvoie l'école ou une erreur (appelée avant l'envoi de l'OTP)
- `complete_signup(...)` : crée le profil après l'OTP (contrôle 18+, domaine et CGU)
- `join_activity(activity_id)` / `leave_activity(activity_id)` : gère les places, la liste d'attente et la promotion automatique, de façon **transactionnelle** (pas de surréservation)
- `get_checkin_token(activity_id)` : réservé à l'organisateur, renvoie un jeton signé valable 60 s
- `checkin(token)` : valide la présence, crédite les points, met à jour `encounters`, attribue les badges
- `request_mentor()` / `respond_mentorship(id, accept)` : gèrent l'attribution des parrains
- `redeem_reward(reward_id)` : vérifie le solde et le stock, débite, génère le code
- `dashboard_stats(school_id, from, to, program?, year?)` : **seul point d'accès aux statistiques**, applique le seuil k ≥ 5
- `send_announcement(...)` : vérifie le quota de 3 par semaine, envoie les push
- **Crons** : rappels J-1 et H-1, expiration des propositions de parrainage (72 h), archivage des conversations, anonymisation des comptes inactifs, push « relance douce »

**Principes RLS :**
- `profiles` : lecture si même `school_id` et statut actif (colonnes publiques uniquement, via une vue `public_profiles`) ; écriture sur soi-même seulement (sauf `role`, `points_balance`, `status`)
- `activities` : lecture si même école et statut `published` (ou créateur, ou modérateur) ; insertion par soi-même (`is_official` refusé sauf ambassadeur/admin) ; mise à jour par le créateur, un ambassadeur ou un admin
- `messages` : lecture et insertion seulement pour les membres de la conversation, avec refus si un blocage existe
- `point_transactions`, `encounters`, `integration_surveys` : **aucune lecture directe par l'admin école**, accès agrégé via `dashboard_stats` uniquement
- Admin école : accès en lecture aux tables de son école **pour la modération uniquement** (signalements et contenus signalés)

---

## 11. Écrans

### 11.1 Application mobile — barre d'onglets
1. 🏠 **Accueil** (fil, filtres, « Pour toi », bascule Liste / Carte)
2. 📅 **Agenda** (mes activités à venir et passées)
3. ➕ **Créer** (bouton central)
4. 💬 **Messages** (conversations)
5. 👤 **Profil** (mon profil, points et badges, goodies, Mes rencontres, parrainage, Besoin de parler, réglages)

**Liste des écrans :**
- *Auth :* Bienvenue · Email · Code OTP · Mot de passe · Infos perso · Centres d'intérêt · CGU et charte · Autorisation notifications · Proposition parrain
- *Activités :* Fil · Carte · Recherche / filtres · Fiche activité · Participants · Créer / modifier · Check-in organisateur (QR + liste) · Scanner QR
- *Social :* Liste des conversations · Conversation · Profil d'un étudiant · Mes rencontres
- *Parrainage :* Devenir parrain (charte) · Demander un parrain · Mon binôme
- *Gamification :* Mes points · Badges · Boutique · Mes retraits (codes)
- *Divers :* Besoin de parler · Réglages (notifications, compte, confidentialité, export, suppression) · Signaler · File de modération (ambassadeurs) · Mentions légales

### 11.2 Back-office web
Connexion · Dashboard · Exports · Annonces · Activités officielles · Modération · Ambassadeurs · Goodies et retraits · Ressources d'écoute · Paramètres de l'école · *(Super-admin)* Écoles · Admins · Vue globale

---

## 12. Identité, ton et design (proposition libre — D30)

- **Nom :** UNION. Le logo peut jouer sur deux cercles qui se rejoignent.
- **Ambiance :** chaleureuse, énergique, rassurante. Surtout pas « appli de santé mentale » : l'app doit donner envie de sortir, pas rappeler qu'on est seul.
- **Palette proposée :**
  - primaire *Corail* `#FF6B4A` (énergie, chaleur)
  - secondaire *Bleu nuit* `#1E2A4A`
  - accent *Jaune soleil* `#FFC94A` (badges, points)
  - fond `#FFF8F3` (clair) / `#12182B` (sombre)
  - une couleur par catégorie pour les épingles de la carte
- **Typographie :** une sans-serif ronde et lisible (ex. *Plus Jakarta Sans* ou *Nunito*).
- **Mode sombre** supporté (M).
- **Ton :** tutoiement, phrases courtes, emojis avec parcimonie.
  - ✅ « Rien de prévu ce soir ? Lance un foot, on te suit. »
  - ✅ « Bienvenue Lucas ! Ta première activité t'attend. »
  - ❌ « Veuillez renseigner l'ensemble des champs obligatoires. » → ✅ « Il manque juste le lieu 😉 »
- **Exception :** l'écran « Besoin de parler » adopte un ton calme et sobre.
- **Créer seul n'est pas bizarre :** sur chaque fiche activité, un petit message rassurant : « Beaucoup viennent seuls, c'est fait pour ça 🙂 » (réponse directe à l'empathy map : « les groupes sont déjà formés »).

---

## 13. Indicateurs de succès du pilote (ESTA, rentrée 2027)

| Indicateur | Objectif fin octobre 2027 | Source |
|---|---|---|
| Utilisateurs actifs (30 j) | **≥ 200** | Dashboard |
| Taux d'adoption des 1res années | ≥ 60 % | Dashboard |
| Nouveaux arrivants avec au moins 1 activité dans leurs 30 premiers jours | ≥ 50 % | F-DASH-09 |
| Taux de participation (présents / inscrits) | ≥ 70 % | F-DASH-07 |
| Activités créées par des étudiants | ≥ 50 % du total | F-DASH-06 |
| Évolution du score d'intégration (inscription → J+60) | + 1 point | F-DASH-12 |
| Part des étudiants passés de « jamais/rarement » à au moins 2 activités par mois | à mesurer | — |
| Note sur les stores | ≥ 4,3 / 5 | Stores |

---

## 14. Plan de développement (octobre 2026 → septembre 2027)

| Lot | Période | Contenu | Livrable testable |
|---|---|---|---|
| **0. Fondations** | Oct.–nov. 2026 | Monorepo, Supabase (UE), schéma et RLS de base, Expo + navigation, design system, CI, Sentry, seed ESTA et démo | App vide qui se lance sur un téléphone |
| **1. Compte** | Nov. 2026 | F-AUTH (domaine, OTP, mot de passe, 18+, CGU), F-PROF | Un étudiant ESTA crée son compte |
| **2. Activités** | Déc. 2026–janv. 2027 | F-ACT 01–11, F-DISC, F-CAL, notifications de base | Créer, rejoindre, voir sur la carte, ajouter au calendrier |
| **3. Social** | Févr. 2027 | F-CHAT, blocage, F-MOD, F-NOTIF | Discuter, signaler, modérer |
| **4. Présence et engagement** | Mars 2027 | Check-in QR, `encounters`, F-MATCH, F-GAME (points, badges) | Les points et « Mes rencontres » fonctionnent |
| **5. Parrainage et aide** | Avr. 2027 | F-MENT, F-HELP, F-SURV | Binômes parrain–filleul |
| **6. Back-office** | Avr.–mai 2027 | F-ADM, F-SUP, F-DASH, exports, annonces, goodies | L'ESTA consulte son dashboard |
| **7. Bêta fermée** | Mai–juin 2027 | Test avec 20 à 40 étudiants ESTA (TestFlight / test interne), corrections, documents RGPD et légaux | Retours utilisateurs intégrés |
| **8. Publication** | Juin 2027 | Soumission App Store et Google Play, fiches store, captures | App disponible sur les stores |
| **9. Préparation pilote** | Juil.–août 2027 | Contenu de lancement (activités officielles de rentrée créées à l'avance avec le BDE), recrutement de parrains et d'ambassadeurs, supports de communication, passage Supabase payant | Tout est prêt |
| **🚀 Lancement** | **Sept. 2027** | Rentrée ESTA | — |

> **Règle anti-effet réseau (risque n°1 de l'étude) :** l'app ne doit **jamais** sembler vide le jour J. Avant la rentrée, il faut au moins **15 activités officielles planifiées** sur les 3 premières semaines, et **au moins 15 parrains volontaires**.

---

## 15. Risques et parades

| Risque | Parade |
|---|---|
| App vide au lancement (effet réseau) | Activités officielles pré-créées, BDE et ambassadeurs mobilisés, présentation UNION pendant la journée d'accueil |
| Planning serré (un seul développeur) | Respect strict des priorités MoSCoW. Le dashboard (S) peut sortir en octobre 2027 sans bloquer la rentrée |
| Refus de l'App Store | Exigences NF-STORE dès le lot 1, soumission en juin |
| Harcèlement ou contenu inapproprié | Blocage, signalements, masquage automatique, ambassadeurs, charte |
| RGPD / confiance de l'école | Données agrégées seulement, k ≥ 5, hébergement UE, DPA |
| Supabase gratuit mis en pause | Passage en payant avant l'ouverture aux étudiants |
| Triche aux points (goodies) | Points uniquement sur check-in QR dynamique, plafond quotidien, historique tracé |

---

## 16. Hypothèses à valider par le groupe

| # | Hypothèse prise dans ce document | Réponse du groupe |
|---|---|---|
| H1 | Réponse 19 (« que la 2 ») interprétée ainsi : **messages privés + discussions de groupe par activité** | ☐ OK ☐ Autre : |
| H2 | **Ambassadeur** = étudiant désigné par l'école, qui publie en « officiel », modère les signalements et valide les présences | ☐ OK ☐ Autre : |
| H3 | Le rôle « bureau d'asso » est supprimé (les assos ont un compte étudiant simple, réponse 31) | ☐ OK ☐ Autre : |
| H4 | **Check-in par QR code** pour valider les présences (indispensable pour des points fiables, le taux de participation et « Mes rencontres ») | ☐ OK ☐ Autre : |
| H5 | Parrain = 2e année ou plus, volontaire, 1 à 3 filleuls. Filleul = étudiant ayant coché « nouveau dans l'établissement » | ☐ OK ☐ Autre : |
| H6 | Rôle **Admin école** ajouté (nécessaire pour le dashboard et la modération) | ☐ OK ☐ Autre : |
| H7 | Pas de classement nominatif public (seulement « top 20 % ») | ☐ OK ☐ Autre : |
| H8 | Facturation des écoles hors application (contrat + virement) | ☐ OK ☐ Autre : |
| H9 | Mini-sondage d'intégration facultatif (à l'inscription et à J+60) pour mesurer l'impact | ☐ OK ☐ Autre : |
| H10 | Pas d'images dans le chat en V1 | ☐ OK ☐ Autre : |
| H11 | Barème de points et liste de badges du §6.9 | ☐ OK ☐ Autre : |

---

## Annexe A — Prompt de démarrage pour Claude Code

À coller dans Claude Code, à la racine d'un dossier vide `union/` contenant ce document dans `docs/` :

```
Tu vas développer UNION, une application mobile (iOS/Android) d'activités entre étudiants, avec un back-office web pour les écoles.
Lis intégralement docs/UNION_Cahier_des_specifications.md : c'est la source de vérité.

Règles :
- Stack imposée : §9 (Expo + TypeScript + Expo Router + NativeWind, Supabase, Next.js pour apps/admin). Structure de dépôt : §9.2.
- Travaille lot par lot (§14). Commence par le LOT 0 uniquement. À la fin de chaque lot : liste ce qui est fait, comment le tester sur mon téléphone, et ce qui reste.
- Toute la logique sensible (points, check-in, stats, parrainage, push) côté serveur (Edge Functions / RPC security definer). Jamais de service key dans l'app.
- RLS obligatoire sur toutes les tables dès leur création, avec un test qui prouve qu'un étudiant d'une école B ne voit rien de l'école A.
- Interface en français, tutoiement, ton décontracté (§12).
- Si une règle manque dans le cahier, prends l'option la plus simple et note-la dans DECISIONS.md.
- Crée un CLAUDE.md qui résume ces règles pour les sessions suivantes.
Commence par me proposer le plan détaillé du LOT 0 avant d'écrire du code.
```

## Annexe B — Rappel des sources
Rapport d'étude de marché EIP Nouveau Départ (mai 2026), Executive summary M1, Annexe M1.2 IMS, Annexe M1.8, Résultats d'observation et empathy map, analyse Sphinx (65 étudiants, 5 établissements), réponses du groupe au questionnaire de cadrage (5 octobre 2026).
