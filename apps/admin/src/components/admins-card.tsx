"use client";

import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { Badge, Button, Card, Input, Notice, Table } from "@/components/ui";
import { rpc } from "@/lib/admin";
import { useAction } from "@/lib/use-action";

type Admin = { email: string; name: string | null; role: string; pending: boolean };

/** Admins d'une école (ou super-admins si schoolId est null) et invitation d'un nouveau (F-SUP-02). */
export function AdminsCard({ schoolId, role }: { schoolId: string | null; role: "school_admin" | "super_admin" }) {
  const [email, setEmail] = useState("");
  const { run, error, success, busy } = useAction(["admins"]);
  const admins = useQuery({
    queryKey: ["admins", schoolId, role],
    queryFn: () => rpc<Admin[]>("admin_list_admins", { p_school_id: schoolId }),
  });

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    const invited = await run(
      "admin_invite",
      { p_email: email, p_role: role, p_school_id: schoolId },
      `Invitation enregistrée. Dites à ${email} d'ouvrir le back-office et de passer par « Première connexion ».`,
    );
    if (invited) setEmail("");
  };

  return (
    <Card title={role === "super_admin" ? "Équipe UNION (super-admins)" : "Administrateurs de l'établissement"}>
      <Notice>{admins.error?.message}</Notice>
      <Table headers={["Email", "Nom", ""]} empty={admins.data?.length === 0}>
        {admins.data?.map((admin) => (
          <tr key={admin.email}>
            <td>{admin.email}</td>
            <td>{admin.name}</td>
            <td>{admin.pending ? <Badge tone="accent">Invitation en attente</Badge> : null}</td>
          </tr>
        ))}
      </Table>
      <form onSubmit={invite} className="mt-4 flex gap-2">
        <Input type="email" required aria-label="Email à inviter" placeholder="prenom.nom@etablissement.fr" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" disabled={busy}>
          Inviter
        </Button>
      </form>
      <div className="mt-3 space-y-2">
        <Notice>{error}</Notice>
        <Notice tone="success">{success}</Notice>
      </div>
    </Card>
  );
}
