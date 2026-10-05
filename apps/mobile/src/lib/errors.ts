// Traduit les erreurs Supabase (auth, RPC, réseau) en messages pour l'utilisateur (§12 : tutoiement, court).

const MESSAGES: Record<string, string> = {
  // Supabase Auth (error.code)
  otp_expired: 'Ce code est faux ou a expiré. Vérifie-le ou demande-en un nouveau.',
  invalid_credentials: 'Email ou mot de passe incorrect.',
  over_email_send_rate_limit: 'Trop de codes demandés. Patiente une minute avant de réessayer.',
  over_request_rate_limit: 'Trop de tentatives. Patiente un peu avant de réessayer.',
  weak_password: 'Ce mot de passe est trop simple : 8 caractères minimum, avec une lettre et un chiffre.',
  same_password: "Choisis un mot de passe différent de l'ancien.",
  user_banned: 'Ton compte a été suspendu, contacte ton école.',
  otp_disabled: "On ne trouve pas de compte avec cet email.",
  signup_disabled: "On ne trouve pas de compte avec cet email.",
  // Codes levés par nos fonctions SQL (error.message)
  school_not_found: "Ton école n'est pas encore sur UNION. Parle-en à ton BDE !",
  terms_required: 'Il faut accepter les CGU et la charte pour continuer.',
  name_invalid: 'Vérifie ton prénom et ton nom.',
  program_invalid: 'Choisis ta formation dans la liste.',
  profile_exists: 'Ton compte existe déjà. Connecte-toi.',
  email_not_verified: "Ton email n'est pas encore vérifié.",
  not_authenticated: 'Ta session a expiré. Reconnecte-toi.',
  start_out_of_range: "L'activité doit commencer dans au moins 30 minutes, et dans 6 mois au plus.",
  official_not_allowed: 'Seuls les ambassadeurs peuvent publier une activité officielle.',
  too_many_activities: "Tu as déjà créé 10 activités aujourd'hui. Reviens demain !",
  activity_locked: 'Cette activité est terminée ou annulée, elle ne peut plus être modifiée.',
  capacity_below_registered: "Il y a déjà plus d'inscrits que ce nombre de places.",
  activity_not_found: "Cette activité n'est plus disponible.",
  activity_started: 'Trop tard, cette activité a déjà commencé.',
  organizer_cannot_leave: "C'est toi qui organises : tu peux annuler l'activité, pas te désinscrire.",
  activities_title_check: 'Le titre doit faire entre 5 et 80 caractères.',
};

export function friendlyError(error: unknown): string {
  const { code = '', message = '' } = (error ?? {}) as { code?: string; message?: string };
  if (/network request failed|failed to fetch/i.test(message)) {
    return 'Pas de connexion. Vérifie ton réseau et réessaie.';
  }
  const known = MESSAGES[code] ?? Object.entries(MESSAGES).find(([key]) => message.includes(key))?.[1];
  return known ?? 'Oups, ça n’a pas marché. Réessaie dans un instant.';
}
