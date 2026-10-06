"use client";

import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { Button, Card, Field, Input, Notice, PageTitle, Table, Textarea } from "@/components/ui";
import { rpc, useAdmin } from "@/lib/admin";
import { useAction } from "@/lib/use-action";

type Resource = { id: string; name: string; description: string | null; phone: string | null; url: string | null; hours: string | null; sort_order: number };

const EMPTY = { id: null as string | null, name: "", description: "", phone: "", url: "", hours: "", sort_order: "0" };

// F-ADM-04 : les ressources d'écoute de l'école, affichées dans l'écran « Besoin de parler ? » de l'app.
export default function ResourcesPage() {
  const { schoolId } = useAdmin();
  const [form, setForm] = useState(EMPTY);
  const { run, error, busy } = useAction(["resources"]);
  const resources = useQuery({
    queryKey: ["resources", schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => rpc<Resource[]>("admin_list_resources", { p_school_id: schoolId }),
  });

  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await run("admin_save_resource", {
      p_school_id: schoolId,
      p_id: form.id,
      p_name: form.name,
      p_description: form.description,
      p_phone: form.phone,
      p_url: form.url,
      p_hours: form.hours,
      p_sort_order: Number(form.sort_order) || 0,
    });
    if (saved) setForm(EMPTY);
  };

  return (
    <>
      <PageTitle
        title="Ressources d'écoute"
        subtitle="Cellule d'écoute, infirmerie, référent bien-être… Elles s'affichent dans l'app, au-dessus des ressources nationales. Vous ne saurez jamais qui consulte cet écran."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card title="Ressources de l'établissement">
          <Notice>{resources.error?.message}</Notice>
          <Table headers={["Nom", "Téléphone", "Horaires", ""]} empty={resources.data?.length === 0}>
            {resources.data?.map((resource) => (
              <tr key={resource.id}>
                <td>
                  <p className="font-semibold">{resource.name}</p>
                  <p className="text-xs text-night/60">{resource.description}</p>
                </td>
                <td>{resource.phone}</td>
                <td>{resource.hours}</td>
                <td className="space-x-2 text-right whitespace-nowrap">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setForm({
                        id: resource.id,
                        name: resource.name,
                        description: resource.description ?? "",
                        phone: resource.phone ?? "",
                        url: resource.url ?? "",
                        hours: resource.hours ?? "",
                        sort_order: String(resource.sort_order),
                      })
                    }>
                    Modifier
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => window.confirm(`Supprimer « ${resource.name} » ?`) && run("admin_delete_resource", { p_id: resource.id })}>
                    Supprimer
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={form.id ? "Modifier la ressource" : "Ajouter une ressource"}>
          <form onSubmit={save} className="space-y-3">
            <Field label="Nom">
              <Input required value={form.name} onChange={set("name")} placeholder="Cellule d'écoute" />
            </Field>
            <Field label="Description">
              <Textarea rows={3} value={form.description} onChange={set("description")} />
            </Field>
            <Field label="Téléphone">
              <Input value={form.phone} onChange={set("phone")} />
            </Field>
            <Field label="Lien">
              <Input type="url" value={form.url} onChange={set("url")} placeholder="https://" />
            </Field>
            <Field label="Horaires et lieu">
              <Input value={form.hours} onChange={set("hours")} placeholder="Lun-ven 9h-17h, bâtiment A" />
            </Field>
            <Field label="Ordre d'affichage" hint="Le plus petit en premier.">
              <Input type="number" value={form.sort_order} onChange={set("sort_order")} />
            </Field>
            <Notice>{error}</Notice>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                Enregistrer
              </Button>
              {form.id ? (
                <Button variant="ghost" onClick={() => setForm(EMPTY)}>
                  Annuler
                </Button>
              ) : null}
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
