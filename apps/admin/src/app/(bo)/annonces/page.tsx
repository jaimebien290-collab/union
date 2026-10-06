"use client";

import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { Button, Card, Field, Input, Notice, PageTitle, Select, Table, Textarea, formatDate } from "@/components/ui";
import { rpc, supabase, useAdmin } from "@/lib/admin";
import { useAction } from "@/lib/use-action";

type Announcement = { id: string; title: string; body: string; target: { program?: string; study_year?: number }; recipients_count: number; sent_at: string };

// F-ADM-07 : annonce envoyée aux étudiants (toute l'école, une formation ou une année). 3 par semaine au plus.
export default function AnnouncementsPage() {
  const { schoolId, context } = useAdmin();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("");
  const [activityId, setActivityId] = useState("");
  const { run, error, success, busy } = useAction(["announcements"]);

  const history = useQuery({
    queryKey: ["announcements", schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => rpc<Announcement[]>("admin_list_announcements", { p_school_id: schoolId }),
  });
  const school = useQuery({
    queryKey: ["school", schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => rpc<{ settings: { programs?: string[] } }>("admin_get_school", { p_school_id: schoolId }),
  });
  // Les activités à venir de l'école, pour lier l'annonce à l'une d'elles (lisibles par un admin de l'école).
  const activities = useQuery({
    queryKey: ["upcoming-activities", schoolId],
    enabled: context?.role === "school_admin",
    queryFn: async () => {
      const { data } = await supabase.from("activities").select("id, title").eq("status", "published").gt("starts_at", new Date().toISOString()).order("starts_at").limit(50);
      return (data ?? []) as { id: string; title: string }[];
    },
  });

  // Heure d'ouverture de la page : sert à compter les annonces des 7 derniers jours.
  const [now] = useState(Date.now);
  const thisWeek = (history.data ?? []).filter((a) => now - new Date(a.sent_at).getTime() < 7 * 86_400_000).length;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!window.confirm("Envoyer cette annonce maintenant ? Elle ne pourra pas être rappelée.")) return;
    const sent = await run<number>(
      "admin_send_announcement",
      { p_school_id: schoolId, p_title: title, p_body: body, p_activity_id: activityId || null, p_program: program || null, p_study_year: year ? Number(year) : null },
      (count) => `Annonce envoyée à ${count} étudiant${count > 1 ? "s" : ""}.`,
    );
    if (sent) {
      setTitle("");
      setBody("");
    }
  };

  return (
    <>
      <PageTitle title="Annonces" subtitle="Un message court envoyé aux étudiants, à réserver aux activités et à la vie de l'application. Trois annonces par semaine au maximum, pour ne pas lasser." />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card title="Nouvelle annonce">
          <form onSubmit={send} className="space-y-3">
            <Field label={`Titre (${title.length}/50)`}>
              <Input required maxLength={50} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label={`Message (${body.length}/180)`}>
              <Textarea required rows={4} maxLength={180} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <Field label="Activité liée (facultatif)">
              <Select value={activityId} onChange={(e) => setActivityId(e.target.value)}>
                <option value="">Aucune</option>
                {activities.data?.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Destinataires : formation">
              <Select value={program} onChange={(e) => setProgram(e.target.value)}>
                <option value="">Toutes les formations</option>
                {(school.data?.settings.programs ?? []).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Destinataires : année">
              <Select value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">Toutes les années</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "1re" : `${n}e`}
                  </option>
                ))}
              </Select>
            </Field>
            <Notice>{error}</Notice>
            <Notice tone="success">{success}</Notice>
            <Button type="submit" disabled={busy || thisWeek >= 3}>
              Envoyer
            </Button>
            <p className="text-xs text-night/60">{thisWeek} annonce{thisWeek > 1 ? "s" : ""} envoyée{thisWeek > 1 ? "s" : ""} sur les 7 derniers jours (3 maximum).</p>
          </form>
        </Card>

        <Card title="Historique">
          <Notice>{history.error?.message}</Notice>
          <Table headers={["Envoyée le", "Annonce", "Cible", "Destinataires"]} empty={history.data?.length === 0}>
            {history.data?.map((announcement) => (
              <tr key={announcement.id}>
                <td className="whitespace-nowrap">{formatDate(announcement.sent_at)}</td>
                <td>
                  <p className="font-semibold">{announcement.title}</p>
                  <p className="text-night/70">{announcement.body}</p>
                </td>
                <td>
                  {[announcement.target.program, announcement.target.study_year ? `${announcement.target.study_year}e année` : ""].filter(Boolean).join(" · ") || "Toute l'école"}
                </td>
                <td>{announcement.recipients_count}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
