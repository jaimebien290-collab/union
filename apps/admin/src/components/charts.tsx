"use client";

import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { categoryLabel, percent, type Week } from "@/lib/dashboard";

// Une seule série par graphique : une seule teinte (bleu nuit de la charte), pas de légende, le titre nomme
// la série. Les libellés et les axes restent en encre neutre.
const SERIES = "#1e2a4a";
const GRID = "#1e2a4a1a";
const INK = "#1e2a4a";
const MUTED = "#6b7489";

const tooltipStyle = { borderRadius: 12, border: "1px solid #1e2a4a26", fontSize: 13, color: INK };
const weekLabel = (iso: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(iso));

/** F-DASH-06 : nombre d'activités par catégorie, de la plus fréquente à la moins fréquente. */
export function CategoryBars({ byCategory }: { byCategory: Record<string, number> }) {
  const data = Object.entries(byCategory)
    .map(([code, count]) => ({ label: categoryLabel(code), count }))
    .sort((a, b) => b.count - a.count);
  if (data.length === 0) return <p className="text-sm text-night/60">Aucune activité sur la période.</p>;

  return (
    <div style={{ height: data.length * 38 + 16 }} role="img" aria-label={`Activités par catégorie : ${data.map((d) => `${d.label} ${d.count}`).join(", ")}`}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 36, top: 0, bottom: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={170} tickLine={false} axisLine={false} tick={{ fill: INK, fontSize: 13 }} />
          <Tooltip cursor={{ fill: GRID }} contentStyle={tooltipStyle} formatter={(value) => [value, "Activités"]} />
          <Bar dataKey="count" fill={SERIES} radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
            <LabelList dataKey="count" position="right" fill={INK} fontSize={13} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type Measure = { key: keyof Omit<Week, "week">; title: string; format: (value: number) => string };

// F-DASH-13 : trois mesures d'échelles différentes → trois petits graphiques alignés, jamais deux axes.
const MEASURES: Measure[] = [
  { key: "engagement_rate", title: "Taux d'engagement", format: (value) => percent(value) },
  { key: "sociability_index", title: "Indice de sociabilité", format: (value) => String(value) },
  { key: "activities", title: "Nombre d'activités", format: (value) => String(value) },
];

export function WeeklyCharts({ weekly }: { weekly: Week[] }) {
  if (weekly.length < 2) return <p className="text-sm text-night/60">Choisissez une période d&apos;au moins deux semaines pour voir l&apos;évolution.</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {MEASURES.map((measure) => (
        <figure key={measure.key}>
          <figcaption className="mb-1 text-sm font-bold text-night">{measure.title}</figcaption>
          <div className="h-44">
            <ResponsiveContainer>
              <LineChart data={weekly} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="week" tickFormatter={weekLabel} tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: MUTED, fontSize: 11 }} minTickGap={24} />
                <YAxis width={44} tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 11 }} tickFormatter={measure.format} allowDecimals={measure.key !== "activities"} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => `Semaine du ${weekLabel(String(label))}`}
                  formatter={(value) => [measure.format(Number(value)), measure.title]}
                />
                {/* Une valeur masquée (moins de 5 étudiants) laisse un trou dans la courbe plutôt qu'un zéro. */}
                <Line dataKey={measure.key} stroke={SERIES} strokeWidth={2} dot={{ r: 3, fill: SERIES }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      ))}
    </div>
  );
}
