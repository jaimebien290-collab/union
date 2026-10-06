"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Badge, Button, Card, Input, Notice, PageTitle, Table } from "@/components/ui";
import { rpc, useAdmin } from "@/lib/admin";
import { useAction } from "@/lib/use-action";

type Student = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  program: string | null;
  study_year: number | null;
  role: "student" | "ambassador";
  status: "active" | "suspended";
};

// F-ADM-03 (ambassadeurs) et F-MOD-04 (suspension). On voit ici qui est inscrit, jamais ce que chacun fait.
export default function StudentsPage() {
  const { schoolId } = useAdmin();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const { run, error, busy } = useAction(["students"]);

  const students = useQuery({
    queryKey: ["students", schoolId, query],
    enabled: Boolean(schoolId),
    queryFn: () => rpc<Student[]>("admin_search_students", { p_school_id: schoolId, p_query: query }),
  });

  const suspend = (student: Student) => {
    if (window.confirm(`Suspendre le compte de ${student.first_name} ${student.last_name} ? Il ne pourra plus utiliser UNION, et ses activités à venir seront annulées.`)) {
      run("admin_set_status", { p_user_id: student.id, p_status: "suspended" });
    }
  };

  return (
    <>
      <PageTitle
        title="Étudiants"
        subtitle="Désignez les ambassadeurs (ils publient des activités officielles, traitent les signalements et valident les présences) et suspendez un compte si nécessaire."
      />
      <Card>
        <form
          className="mb-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search);
          }}>
          <Input aria-label="Rechercher un étudiant" placeholder="Nom ou email" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button type="submit">Rechercher</Button>
        </form>
        <Notice>{error || students.error?.message}</Notice>
        <Table headers={["Nom", "Email", "Formation", "Statut", ""]} empty={students.data?.length === 0}>
          {students.data?.map((student) => (
            <tr key={student.id}>
              <td className="font-semibold">
                {student.first_name} {student.last_name}
              </td>
              <td>{student.email}</td>
              <td>{[student.program, student.study_year ? `${student.study_year}e année` : ""].filter(Boolean).join(" · ")}</td>
              <td className="space-x-1">
                {student.role === "ambassador" ? <Badge tone="accent">Ambassadeur</Badge> : null}
                {student.status === "suspended" ? <Badge tone="alert">Suspendu</Badge> : null}
              </td>
              <td className="space-x-2 text-right whitespace-nowrap">
                <Button
                  variant="secondary"
                  disabled={busy || student.status === "suspended"}
                  onClick={() => run("admin_set_role", { p_user_id: student.id, p_role: student.role === "ambassador" ? "student" : "ambassador" })}>
                  {student.role === "ambassador" ? "Retirer le rôle" : "Nommer ambassadeur"}
                </Button>
                {student.status === "suspended" ? (
                  <Button variant="secondary" disabled={busy} onClick={() => run("admin_set_status", { p_user_id: student.id, p_status: "active" })}>
                    Réactiver
                  </Button>
                ) : (
                  <Button variant="danger" disabled={busy} onClick={() => suspend(student)}>
                    Suspendre
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-xs text-night/60">50 résultats au plus : affinez la recherche pour trouver quelqu&apos;un.</p>
      </Card>
    </>
  );
}
