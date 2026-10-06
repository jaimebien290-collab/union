"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { CategoryBars, WeeklyCharts } from "@/components/charts";
import { Button, Card, Field, Input, Notice, PageTitle, Select, Table } from "@/components/ui";
import { rpc, useAdmin } from "@/lib/admin";
import { DEFINITIONS, exportExcel, MASKED, percent, type Segment, type StatsResult } from "@/lib/dashboard";

type Preset = "7" | "30" | "182" | "365" | "custom";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "7", label: "7 jours" },
  { value: "30", label: "30 jours" },
  { value: "182", label: "Semestre" },
  { value: "365", label: "Année" },
  { value: "custom", label: "Personnalisée" },
];

const isoDay = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const daysAgo = (days: number) => isoDay(new Date(Date.now() - days * 86_400_000));

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-night/70">{label}</p>
      <p className="mt-1 text-3xl font-extrabold text-night">{value}</p>
      {detail ? <p className="mt-1 text-xs text-night/60">{detail}</p> : null}
    </div>
  );
}

function Segments({ title, segments }: { title: string; segments: Segment[] }) {
  return (
    <Card title={title}>
      <Table headers={["", "Étudiants", "Taux d'engagement"]} empty={segments.length === 0}>
        {segments.map((segment) => (
          <tr key={segment.label}>
            <td className="font-semibold">{segment.label}</td>
            {"masked" in segment ? (
              <td colSpan={2} className="text-night/60">
                {MASKED}
              </td>
            ) : (
              <>
                <td>{segment.students}</td>
                <td>{percent(segment.engagement_rate)}</td>
              </>
            )}
          </tr>
        ))}
      </Table>
    </Card>
  );
}

// F-DASH : tout est agrégé, tout groupe de moins de 5 étudiants est masqué.
export default function DashboardPage() {
  const { schoolId, schoolName } = useAdmin();
  const [preset, setPreset] = useState<Preset>("30");
  const [customFrom, setCustomFrom] = useState(daysAgo(30));
  const [customTo, setCustomTo] = useState(daysAgo(0));
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("");

  const from = preset === "custom" ? customFrom : daysAgo(Number(preset));
  const to = preset === "custom" ? customTo : daysAgo(0);

  const school = useQuery({
    queryKey: ["school", schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => rpc<{ settings: { programs?: string[] } }>("admin_get_school", { p_school_id: schoolId }),
  });
  const stats = useQuery({
    queryKey: ["stats", schoolId, from, to, program, year],
    enabled: Boolean(schoolId),
    queryFn: () =>
      rpc<StatsResult>("dashboard_stats", {
        p_school_id: schoolId,
        p_from: from,
        p_to: to,
        p_program: program || null,
        p_study_year: year ? Number(year) : null,
      }),
  });

  const data = stats.data;
  const filters = [program, year ? `${year}e année` : ""].filter(Boolean).join(" · ") || "Tous les étudiants";

  return (
    <>
      <PageTitle
        title="Tableau de bord"
        subtitle={`${schoolName} · du ${from} au ${to} · ${filters}`}
        actions={
          data && !data.masked ? (
            <>
              <Button variant="secondary" onClick={() => exportExcel(data, schoolName, filters)}>
                Exporter en Excel
              </Button>
              {/* F-DASH-15 : la page est mise en forme pour l'impression ; « Enregistrer au format PDF ». */}
              <Button variant="secondary" onClick={() => window.print()}>
                Exporter en PDF
              </Button>
            </>
          ) : null
        }
      />

      {/* Tous les filtres sur une ligne, au-dessus des indicateurs. */}
      <div className="mb-6 grid gap-3 rounded-3xl bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5 print:hidden">
        <Field label="Période">
          <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            {PRESETS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        {preset === "custom" ? (
          <>
            <Field label="Du">
              <Input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
            </Field>
            <Field label="Au">
              <Input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} />
            </Field>
          </>
        ) : null}
        <Field label="Formation">
          <Select value={program} onChange={(e) => setProgram(e.target.value)}>
            <option value="">Toutes</option>
            {(school.data?.settings.programs ?? []).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Année d'études">
          <Select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Toutes</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "1re" : `${n}e`}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {stats.isPending ? <p className="text-night/60">Calcul des indicateurs…</p> : null}
      <Notice>{stats.error?.message}</Notice>
      {data?.masked ? (
        <Notice tone="info">
          Moins de {data.threshold} étudiants correspondent à ces filtres : les données sont masquées pour préserver l&apos;anonymat.
        </Notice>
      ) : null}

      {data && !data.masked ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Étudiants inscrits" value={String(data.registered)} detail={data.adoption_rate === null ? undefined : `Taux d'adoption : ${percent(data.adoption_rate)}`} />
            <Tile label="Étudiants actifs" value={String(data.active_30d)} detail={`sur 30 jours · ${data.active_7d} sur 7 jours`} />
            <Tile label="Taux d'engagement" value={percent(data.engagement_rate)} detail={`${data.engaged} étudiants avec une présence validée`} />
            <Tile
              label="Indice de sociabilité"
              value={data.sociability_index === null ? "—" : String(data.sociability_index)}
              detail={data.sociability_index === null ? MASKED : "personnes rencontrées par étudiant engagé"}
            />
            <Tile label="Taux de sociabilité" value={percent(data.sociability_rate)} detail="ont rencontré au moins 3 personnes" />
            <Tile label="Taux de participation" value={percent(data.participation_rate)} detail="présents parmi les inscrits" />
            <Tile label="Taux de remplissage" value={percent(data.fill_rate)} detail="activités à places limitées" />
            <Tile
              label="Nouveaux arrivants engagés"
              value={"masked" in data.newcomers ? "—" : percent(data.newcomers.engaged_30d_rate)}
              detail={"masked" in data.newcomers ? MASKED : `sur ${data.newcomers.count} nouveaux, dans leurs 30 premiers jours`}
            />
          </div>

          <Card title={`Activités : ${data.activities.total} sur la période`}>
            <p className="mb-3 text-sm text-night/70">
              {data.activities.official} officielle{data.activities.official > 1 ? "s" : ""} · {data.activities.student} proposée
              {data.activities.student > 1 ? "s" : ""} par des étudiants
            </p>
            <CategoryBars byCategory={data.activities.by_category} />
          </Card>

          <Card title="Évolution par semaine">
            <WeeklyCharts weekly={data.weekly} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Segments title="Engagement par formation" segments={data.by_program} />
            <Segments title="Engagement par année d'études" segments={data.by_study_year} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Score d'intégration déclaré">
              <Table headers={["", "Réponses", "Score moyen sur 10"]}>
                {(["signup", "d60"] as const).map((wave) => {
                  const value = data.integration[wave];
                  return (
                    <tr key={wave}>
                      <td className="font-semibold">{wave === "signup" ? "À l'inscription" : "À J+60"}</td>
                      {"masked" in value ? (
                        <td colSpan={2} className="text-night/60">
                          {MASKED}
                        </td>
                      ) : (
                        <>
                          <td>{value.responses}</td>
                          <td>{value.average}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </Table>
            </Card>
            <Card title="Parrainage">
              <Table headers={["", "Nombre"]}>
                <tr>
                  <td className="font-semibold">Binômes actifs</td>
                  <td>{data.mentoring.active_pairs}</td>
                </tr>
                <tr>
                  <td className="font-semibold">Demandes en attente</td>
                  <td>{data.mentoring.pending_requests}</td>
                </tr>
                <tr>
                  <td className="font-semibold">Parrains volontaires</td>
                  <td>{data.mentoring.volunteer_mentors}</td>
                </tr>
              </Table>
            </Card>
          </div>

          <Card title="Définitions des indicateurs">
            <dl className="space-y-2 text-sm">
              {DEFINITIONS.map(([term, definition]) => (
                <div key={term}>
                  <dt className="font-bold">{term}</dt>
                  <dd className="text-night/75">{definition}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      ) : null}
    </>
  );
}
