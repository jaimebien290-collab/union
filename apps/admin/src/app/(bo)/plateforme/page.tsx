"use client";

import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { AdminsCard } from "@/components/admins-card";
import { Badge, Button, Card, Field, Input, Notice, PageTitle, Table } from "@/components/ui";
import { rpc, useAdmin } from "@/lib/admin";
import { useAction } from "@/lib/use-action";

type Overview = { schools: number; active_schools: number; students: number; activities: number; presences: number };

// F-SUP : création des écoles, équipe UNION, vue globale. Réservé au super-admin.
export default function PlatformPage() {
  const { context, setSchoolId } = useAdmin();
  const isSuper = context?.role === "super_admin";
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [domains, setDomains] = useState("");
  const { run, error, success, busy } = useAction(["admin-context", "overview"]);
  const overview = useQuery({ queryKey: ["overview"], enabled: isSuper, queryFn: () => rpc<Overview>("admin_overview") });

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const created = await run(
      "admin_create_school",
      { p_name: name, p_slug: slug, p_email_domains: domains.split(",").map((domain) => domain.trim().toLowerCase()).filter(Boolean) },
      "École créée. Sélectionnez-la dans le menu pour régler ses paramètres et inviter son premier admin.",
    );
    if (created) {
      setName("");
      setSlug("");
      setDomains("");
    }
  };

  if (!isSuper) {
    return (
      <>
        <PageTitle title="Plateforme" />
        <Notice>Cette page est réservée à l&apos;équipe UNION.</Notice>
      </>
    );
  }

  const tiles: [string, number | undefined][] = [
    ["Écoles actives", overview.data?.active_schools],
    ["Étudiants inscrits", overview.data?.students],
    ["Activités publiées", overview.data?.activities],
    ["Présences validées", overview.data?.presences],
  ];

  return (
    <>
      <PageTitle title="Plateforme" subtitle="Toutes les écoles partenaires d'UNION." />
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-3xl bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-night/70">{label}</p>
              <p className="mt-1 text-3xl font-extrabold">{value ?? "—"}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Card title="Écoles">
            <Table headers={["École", "", ""]}>
              {context.schools.map((school) => (
                <tr key={school.id}>
                  <td className="font-semibold">{school.name}</td>
                  <td>{school.is_active ? null : <Badge tone="alert">Inactive</Badge>}</td>
                  <td className="text-right">
                    <Button variant="secondary" onClick={() => setSchoolId(school.id)}>
                      Consulter
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="Nouvelle école">
            <form onSubmit={create} className="space-y-3">
              <Field label="Nom">
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Identifiant" hint="Court, sans espace : iut-belfort">
                <Input required pattern="[a-z0-9-]+" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
              </Field>
              <Field label="Domaines email des étudiants" hint="Séparés par des virgules.">
                <Input required value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="etudiants-ecole.fr" />
              </Field>
              <Notice>{error}</Notice>
              <Notice tone="success">{success}</Notice>
              <Button type="submit" disabled={busy}>
                Créer l&apos;école
              </Button>
            </form>
          </Card>
        </div>

        <AdminsCard schoolId={null} role="super_admin" />
      </div>
    </>
  );
}
