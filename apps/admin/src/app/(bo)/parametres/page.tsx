"use client";

import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { DEFAULT_POINTS } from "@union/shared";

import { AdminsCard } from "@/components/admins-card";
import { Button, Card, Field, Input, Notice, PageTitle, Textarea } from "@/components/ui";
import { rpc, useAdmin } from "@/lib/admin";
import { useAction } from "@/lib/use-action";

type School = {
  id: string;
  name: string;
  logo_url: string | null;
  campus_address: string | null;
  campus_lat: number | null;
  campus_lng: number | null;
  declared_student_count: number | null;
  email_domains: string[];
  is_active: boolean;
  subscription_ends_at: string | null;
  settings: { mentoring_enabled?: boolean; programs?: string[]; points?: Record<string, number> };
};

const POINT_LABELS: [keyof typeof DEFAULT_POINTS, string][] = [
  ["attendance", "Présence validée"],
  ["first_activity_bonus", "Bonus première activité"],
  ["organizer_success", "Activité organisée réussie"],
  ["new_category", "Nouvelle catégorie"],
  ["mentor_pair_attendance", "Parrain et filleul ensemble"],
  ["mentee_accepted", "Filleul accepté"],
  ["daily_cap", "Plafond par jour"],
];

function Form({ school, isSuper }: { school: School; isSuper: boolean }) {
  const { run, error, success, busy } = useAction(["school", "admin-context"]);
  const [name, setName] = useState(school.name);
  const [logoUrl, setLogoUrl] = useState(school.logo_url ?? "");
  const [address, setAddress] = useState(school.campus_address ?? "");
  const [lat, setLat] = useState(school.campus_lat?.toString() ?? "");
  const [lng, setLng] = useState(school.campus_lng?.toString() ?? "");
  const [declared, setDeclared] = useState(school.declared_student_count?.toString() ?? "");
  const [mentoring, setMentoring] = useState(school.settings.mentoring_enabled !== false);
  const [programs, setPrograms] = useState((school.settings.programs ?? []).join("\n"));
  const [points, setPoints] = useState<Record<string, string>>(
    Object.fromEntries(POINT_LABELS.map(([key]) => [key, String(school.settings.points?.[key] ?? DEFAULT_POINTS[key])])),
  );
  const [domains, setDomains] = useState(school.email_domains.join(", "));
  const [active, setActive] = useState(school.is_active);
  const [endsAt, setEndsAt] = useState(school.subscription_ends_at ?? "");

  // Place le centre de la carte sur l'adresse du campus (géocodage de la Géoplateforme).
  const locate = async () => {
    const response = await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(address)}&limit=1`);
    const feature = response.ok ? (await response.json()).features?.[0] : null;
    if (feature) {
      setLng(String(feature.geometry.coordinates[0]));
      setLat(String(feature.geometry.coordinates[1]));
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    run(
      "admin_update_school",
      {
        p_school_id: school.id,
        p_patch: {
          name,
          logo_url: logoUrl,
          campus_address: address,
          campus_lat: lat ? Number(lat) : null,
          campus_lng: lng ? Number(lng) : null,
          declared_student_count: declared ? Number(declared) : null,
          settings: {
            mentoring_enabled: mentoring,
            programs: programs.split("\n").map((line) => line.trim()).filter(Boolean),
            points: Object.fromEntries(Object.entries(points).map(([key, value]) => [key, Number(value) || 0])),
          },
          // Ignorés côté serveur si l'appelant n'est pas super-admin.
          email_domains: domains.split(",").map((domain) => domain.trim().toLowerCase()).filter(Boolean),
          is_active: active,
          subscription_ends_at: endsAt || null,
        },
      },
      "Paramètres enregistrés.",
    );
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <Card title="Établissement">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom">
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Logo (lien vers une image)">
            <Input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Effectif déclaré" hint="Sert à calculer le taux d'adoption.">
            <Input type="number" min={0} value={declared} onChange={(e) => setDeclared(e.target.value)} />
          </Field>
          <Field label="Adresse du campus" hint="Centre de la carte dans l'app.">
            <div className="flex gap-2">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              <Button variant="secondary" onClick={locate}>
                Localiser
              </Button>
            </div>
          </Field>
          <Field label="Latitude">
            <Input value={lat} onChange={(e) => setLat(e.target.value)} />
          </Field>
          <Field label="Longitude">
            <Input value={lng} onChange={(e) => setLng(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Formations et parrainage">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Formations" hint="Une par ligne. Les étudiants choisissent dans cette liste à l'inscription.">
            <Textarea rows={5} value={programs} onChange={(e) => setPrograms(e.target.value)} />
          </Field>
          <label className="flex items-start gap-2 text-sm font-semibold">
            <input type="checkbox" className="mt-1" checked={mentoring} onChange={(e) => setMentoring(e.target.checked)} />
            Activer le parrainage entre étudiants
          </label>
        </div>
      </Card>

      <Card title="Barème des points">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {POINT_LABELS.map(([key, label]) => (
            <Field key={key} label={label}>
              <Input type="number" min={0} value={points[key]} onChange={(e) => setPoints({ ...points, [key]: e.target.value })} />
            </Field>
          ))}
        </div>
      </Card>

      <Card title="Accès et abonnement">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Domaines email autorisés" hint={isSuper ? "Séparés par des virgules." : "Modifiables par l'équipe UNION uniquement."}>
            <Input disabled={!isSuper} value={domains} onChange={(e) => setDomains(e.target.value)} />
          </Field>
          <Field label="Fin d'abonnement">
            <Input type="date" disabled={!isSuper} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" disabled={!isSuper} checked={active} onChange={(e) => setActive(e.target.checked)} />
            École active
          </label>
        </div>
      </Card>

      <Notice>{error}</Notice>
      <Notice tone="success">{success}</Notice>
      <Button type="submit" disabled={busy}>
        Enregistrer les paramètres
      </Button>
    </form>
  );
}

// F-ADM-02 : paramètres de l'école. Domaines, état et abonnement : super-admin uniquement.
export default function SettingsPage() {
  const { schoolId, context } = useAdmin();
  const school = useQuery({ queryKey: ["school", schoolId], enabled: Boolean(schoolId), queryFn: () => rpc<School>("admin_get_school", { p_school_id: schoolId }) });

  return (
    <>
      <PageTitle title="Paramètres" />
      <Notice>{school.error?.message}</Notice>
      <div className="space-y-6">
        {/* La clé remonte le formulaire quand on change d'école ou qu'on recharge ses données. */}
        {school.data ? <Form key={`${school.data.id}-${school.dataUpdatedAt}`} school={school.data} isSuper={context?.role === "super_admin"} /> : null}
        {schoolId ? <AdminsCard schoolId={schoolId} role="school_admin" /> : null}
      </div>
    </>
  );
}
