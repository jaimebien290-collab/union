"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { CATEGORIES } from "@union/shared";

import { Badge, Button, Card, Field, Input, Notice, PageTitle, Select, Table, Textarea, formatDate } from "@/components/ui";
import { friendly, supabase, useAdmin } from "@/lib/admin";

type Place = { label: string; name: string; lat: number; lng: number };
type Activity = { id: string; title: string; starts_at: string; location_name: string; status: string };

/** Adresses françaises : géocodage de la Géoplateforme, comme dans l'app mobile. */
async function searchPlaces(text: string): Promise<Place[]> {
  const response = await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(text)}&limit=5&autocomplete=1`);
  if (!response.ok) return [];
  const json = (await response.json()) as { features?: { geometry: { coordinates: [number, number] }; properties: { label: string; name: string } }[] };
  return (json.features ?? []).map((f) => ({ label: f.properties.label, name: f.properties.name, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
}

// F-ADM-08 : l'école publie une activité officielle (badge ⭐, mise en avant en haut du fil).
// Sur place, ce sont les ambassadeurs qui valident les présences depuis l'app.
export default function OfficialActivitiesPage() {
  const { context, schoolId } = useAdmin();
  const queryClient = useQueryClient();
  const isSchoolAdmin = context?.role === "school_admin";
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[2].code);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [address, setAddress] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [placeName, setPlaceName] = useState("");
  const [description, setDescription] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const activities = useQuery({
    queryKey: ["official-activities", schoolId],
    enabled: isSchoolAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("activities").select("id, title, starts_at, location_name, status").eq("is_official", true).order("starts_at", { ascending: false }).limit(50);
      if (error) throw new Error(friendly(error));
      return data as Activity[];
    },
  });

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!place) return setError("Cherchez l'adresse et choisissez-la dans la liste.");
    setBusy(true);
    const { error } = await supabase.from("activities").insert({
      title,
      category,
      is_official: true,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      location_name: placeName.trim() || place.name,
      address: place.label,
      lat: place.lat,
      lng: place.lng,
      description: description.trim() || null,
      max_participants: maxParticipants ? Number(maxParticipants) : null,
    });
    setBusy(false);
    if (error) {
      const known: Record<string, string> = {
        start_out_of_range: "L'activité doit commencer dans au moins 30 minutes, et dans 6 mois au plus.",
        too_many_activities: "Limite de 10 activités créées par jour atteinte.",
        activities_title_check: "Le titre doit faire entre 5 et 80 caractères.",
        activities_check: "La fin doit être après le début.",
      };
      return setError(Object.entries(known).find(([key]) => error.message.includes(key))?.[1] ?? friendly(error));
    }
    setSuccess("Activité publiée : elle est visible dans l'app.");
    setTitle("");
    setDescription("");
    await queryClient.invalidateQueries({ queryKey: ["official-activities"] });
  };

  const cancel = async (activity: Activity) => {
    if (!window.confirm(`Annuler « ${activity.title} » ? Tous les inscrits seront prévenus.`)) return;
    const { error } = await supabase.rpc("cancel_activity", { p_activity_id: activity.id });
    if (error) setError(friendly(error));
    await queryClient.invalidateQueries({ queryKey: ["official-activities"] });
  };

  if (!isSchoolAdmin) {
    return (
      <>
        <PageTitle title="Activités officielles" />
        <Notice tone="info">La publication se fait depuis un compte admin de l&apos;école concernée.</Notice>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Activités officielles" subtitle="Les temps forts de l'établissement : rentrée, soirées, tournois. Elles portent le badge ⭐ et s'affichent en haut du fil des étudiants." />
      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        <Card title="Publier une activité">
          <form onSubmit={publish} className="space-y-3">
            <Field label="Titre">
              <Input required minLength={5} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Catégorie">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.emoji} {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Début">
              <Input type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field label="Fin" hint="Vide : 2 heures après le début.">
              <Input type="datetime-local" value={endsAt} min={startsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </Field>
            <Field label="Adresse">
              <div className="flex gap-2">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="3 rue du Docteur Fréry, Belfort" />
                <Button variant="secondary" onClick={async () => setResults(await searchPlaces(address))}>
                  Chercher
                </Button>
              </div>
            </Field>
            {results.map((result) => (
              <button
                key={`${result.label}-${result.lat}`}
                type="button"
                onClick={() => {
                  setPlace(result);
                  setPlaceName(result.name);
                  setResults([]);
                }}
                className="block w-full rounded-xl bg-cream px-3 py-2 text-left text-sm hover:bg-sun/30">
                {result.label}
              </button>
            ))}
            {place ? (
              <Field label="Nom du lieu" hint={place.label}>
                <Input value={placeName} maxLength={120} onChange={(e) => setPlaceName(e.target.value)} />
              </Field>
            ) : null}
            <Field label="Description">
              <Textarea rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field label="Nombre de places" hint="Vide : illimité.">
              <Input type="number" min={2} max={500} value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} />
            </Field>
            <Notice>{error}</Notice>
            <Notice tone="success">{success}</Notice>
            <Button type="submit" disabled={busy}>
              Publier
            </Button>
          </form>
        </Card>

        <Card title="Activités officielles publiées">
          <Notice>{activities.error?.message}</Notice>
          <Table headers={["Date", "Activité", "Lieu", "", ""]} empty={activities.data?.length === 0}>
            {activities.data?.map((activity) => (
              <tr key={activity.id}>
                <td className="whitespace-nowrap">{formatDate(activity.starts_at)}</td>
                <td className="font-semibold">{activity.title}</td>
                <td>{activity.location_name}</td>
                <td>{activity.status === "cancelled" ? <Badge>Annulée</Badge> : null}</td>
                <td className="text-right">
                  {activity.status === "published" && new Date(activity.starts_at) > new Date() ? (
                    <Button variant="ghost" onClick={() => cancel(activity)}>
                      Annuler
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
