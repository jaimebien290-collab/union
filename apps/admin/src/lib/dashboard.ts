import { CATEGORIES } from "@union/shared";

type Masked = { masked: true };
export type Segment = { label: string; students: number; engagement_rate: number } | ({ label: string } & Masked);
export type Week = { week: string; engagement_rate: number; sociability_index: number | null; activities: number };

/** Réponse de dashboard_stats quand la population dépasse le seuil de k-anonymat. Les taux sont entre 0 et 1. */
export type Stats = {
  masked: false;
  threshold: number;
  period: { from: string; to: string };
  registered: number;
  adoption_rate: number | null;
  active_7d: number;
  active_30d: number;
  engaged: number;
  engagement_rate: number;
  sociability_index: number | null;
  sociability_rate: number;
  participation_rate: number | null;
  fill_rate: number | null;
  newcomers: { count: number; engaged_30d_rate: number } | Masked;
  activities: { total: number; official: number; student: number; by_category: Record<string, number> };
  mentoring: { active_pairs: number; pending_requests: number; volunteer_mentors: number };
  by_program: Segment[];
  by_study_year: Segment[];
  integration: Record<"signup" | "d60", { responses: number; average: number } | Masked>;
  weekly: Week[];
};

export type StatsResult = Stats | { masked: true; threshold: number };

export const MASKED = "< 5, donnée masquée";

export const percent = (rate: number | null | undefined) => (rate === null || rate === undefined ? "—" : `${Math.round(rate * 1000) / 10} %`);

export const categoryLabel = (code: string) => CATEGORIES.find((category) => category.code === code)?.label ?? code;

/** Définitions des indicateurs, reprises telles quelles dans l'export PDF et l'export Excel (F-DASH-15). */
export const DEFINITIONS: [string, string][] = [
  ["Étudiants inscrits", "Comptes étudiants actifs sur UNION, dans le périmètre des filtres."],
  ["Taux d'adoption", "Étudiants inscrits rapportés à l'effectif déclaré de l'établissement."],
  ["Étudiants actifs (7 j / 30 j)", "Étudiants ayant ouvert l'application au moins une fois sur les 7 ou 30 derniers jours."],
  ["Taux d'engagement", "Part des inscrits ayant au moins une présence validée à une activité sur la période."],
  ["Indice de sociabilité", "Nombre moyen de personnes distinctes rencontrées (présence validée à la même activité) par étudiant engagé, sur la période."],
  ["Taux de sociabilité", "Part des inscrits ayant rencontré au moins 3 personnes distinctes sur la période."],
  ["Taux de participation", "Présences validées rapportées aux inscriptions, sur les activités terminées de la période."],
  ["Taux de remplissage", "Inscrits rapportés aux places disponibles, sur les activités à places limitées."],
  ["Nouveaux arrivants engagés", "Part des nouveaux arrivants ayant au moins une présence validée dans leurs 30 premiers jours."],
  ["Score d'intégration déclaré", "Moyenne des réponses à la question « Sur 10, comment tu te sens intégré(e) dans ton école ? », à l'inscription puis 60 jours après."],
  ["Confidentialité", "Tous les indicateurs sont agrégés. Tout groupe de moins de 5 étudiants est masqué. Aucune donnée individuelle n'est accessible à l'établissement."],
];

const segmentRows = (segments: Segment[]) =>
  segments.map((segment) => ("masked" in segment ? [segment.label, MASKED, MASKED] : [segment.label, segment.students, segment.engagement_rate]));

/** F-DASH-14 : un onglet par indicateur, avec la période et les données agrégées. */
export async function exportExcel(stats: Stats, schoolName: string, filters: string) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const period = `Du ${stats.period.from} au ${stats.period.to}`;

  const sheet = (name: string, headers: string[], rows: (string | number | null)[][]) => {
    const worksheet = workbook.addWorksheet(name);
    worksheet.addRow([schoolName, period, filters]);
    worksheet.addRow([]);
    worksheet.addRow(headers).font = { bold: true };
    for (const row of rows) worksheet.addRow(row);
    worksheet.columns.forEach((column) => (column.width = 32));
  };

  const newcomers = "masked" in stats.newcomers ? [MASKED, MASKED] : [stats.newcomers.count, stats.newcomers.engaged_30d_rate];
  sheet("Synthèse", ["Indicateur", "Valeur"], [
    ["Étudiants inscrits", stats.registered],
    ["Taux d'adoption", stats.adoption_rate],
    ["Étudiants actifs 7 j", stats.active_7d],
    ["Étudiants actifs 30 j", stats.active_30d],
    ["Étudiants engagés", stats.engaged],
    ["Taux d'engagement", stats.engagement_rate],
    ["Indice de sociabilité", stats.sociability_index ?? MASKED],
    ["Taux de sociabilité", stats.sociability_rate],
    ["Taux de participation", stats.participation_rate],
    ["Taux de remplissage", stats.fill_rate],
    ["Nouveaux arrivants", newcomers[0]],
    ["Nouveaux arrivants engagés sous 30 j", newcomers[1]],
  ]);
  sheet("Activités", ["Catégorie", "Nombre d'activités"], [
    ["Total", stats.activities.total],
    ["Officielles", stats.activities.official],
    ["Étudiantes", stats.activities.student],
    ...Object.entries(stats.activities.by_category).map(([code, count]) => [categoryLabel(code), count] as [string, number]),
  ]);
  sheet("Par formation", ["Formation", "Étudiants", "Taux d'engagement"], segmentRows(stats.by_program));
  sheet("Par année", ["Année d'études", "Étudiants", "Taux d'engagement"], segmentRows(stats.by_study_year));
  sheet("Évolution hebdomadaire", ["Semaine du", "Taux d'engagement", "Indice de sociabilité", "Activités"],
    stats.weekly.map((week) => [week.week, week.engagement_rate, week.sociability_index ?? MASKED, week.activities]));
  sheet("Parrainage", ["Indicateur", "Valeur"], [
    ["Binômes actifs", stats.mentoring.active_pairs],
    ["Demandes en attente", stats.mentoring.pending_requests],
    ["Parrains volontaires", stats.mentoring.volunteer_mentors],
  ]);
  sheet("Intégration", ["Vague", "Réponses", "Score moyen sur 10"],
    (["signup", "d60"] as const).map((wave) => {
      const value = stats.integration[wave];
      const label = wave === "signup" ? "À l'inscription" : "À J+60";
      return "masked" in value ? [label, MASKED, MASKED] : [label, value.responses, value.average];
    }));
  sheet("Définitions", ["Indicateur", "Définition"], DEFINITIONS);

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `union-${stats.period.from}-${stats.period.to}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
