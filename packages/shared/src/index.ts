import colors from './colors.json';

export { colors };

// §6.3 — liste fixe en V1. Le code est ce qui est stocké en base (activities.category, profiles.interests).
export const CATEGORIES = [
  { code: 'sport', label: 'Sport', emoji: '⚽' },
  { code: 'outings', label: 'Sorties & divertissement', emoji: '🎳' },
  { code: 'parties', label: 'Soirées & événements', emoji: '🎉' },
  { code: 'travel', label: 'Voyages & week-ends', emoji: '🧳' },
  { code: 'culture', label: 'Culture', emoji: '🎭' },
  { code: 'study', label: 'Révisions & entraide', emoji: '📚' },
  { code: 'food', label: 'Repas & cafés', emoji: '☕' },
  { code: 'games', label: 'Jeux', emoji: '🎲' },
  { code: 'other', label: 'Autre', emoji: '✨' },
] as const;

export type CategoryCode = (typeof CATEGORIES)[number]['code'];

// §6.9 — barème par défaut, surchargé par schools.settings.points.
export const DEFAULT_POINTS = {
  attendance: 10,
  first_activity_bonus: 15,
  organizer_success: 20,
  organizer_min_attendees: 3,
  new_category: 5,
  mentor_pair_attendance: 15,
  mentee_accepted: 10,
  daily_cap: 60,
} as const;

export const BADGES = [
  { code: 'first_step', name: 'Premier pas', emoji: '🌱', description: 'Ta 1re activité' },
  { code: 'explorer', name: 'Explorateur', emoji: '🧭', description: '4 catégories différentes' },
  { code: 'athlete', name: 'Sportif', emoji: '⚽', description: '5 activités Sport' },
  { code: 'organizer', name: 'Organisateur', emoji: '🎤', description: '3 activités organisées réussies' },
  { code: 'mentor', name: 'Parrain', emoji: '🤝', description: 'Ton premier filleul accepté' },
  { code: 'pillar', name: 'Pilier', emoji: '🏛', description: '20 activités' },
  { code: 'regular', name: 'Régulier', emoji: '🔥', description: 'Au moins 1 activité par semaine pendant 4 semaines' },
] as const;

export type BadgeCode = (typeof BADGES)[number]['code'];

export const MIN_AGE = 18;

// NF-STORE-02 : contact d'assistance visible dans l'app. Adresse provisoire, à créer avant la publication.
export const SUPPORT_EMAIL = 'support@union-app.fr';
