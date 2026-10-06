"use client";

import { useQuery } from "@tanstack/react-query";

import { Badge, Button, Card, Notice, PageTitle, formatDate } from "@/components/ui";
import { rpc, useAdmin } from "@/lib/admin";
import { useAction } from "@/lib/use-action";

type Item = {
  target_type: "activity" | "message" | "user";
  target_id: string;
  target_user_id: string;
  author_name: string | null;
  report_count: number;
  reasons: string[];
  comments: string[];
  first_reported_at: string;
  preview: string | null;
  is_hidden: boolean;
};

const TYPES = { activity: "Activité", message: "Message", user: "Profil" };
const REASONS: Record<string, string> = {
  inappropriate: "Contenu inapproprié",
  harassment: "Harcèlement",
  spam: "Spam",
  fake_profile: "Faux profil",
  danger: "Danger",
  other: "Autre",
  auto_filter: "Filtre automatique",
};

// F-ADM-05 / F-MOD-03 : la file de modération de l'école. La fonction ne répond que pour un admin d'école.
export default function ModerationPage() {
  const { context } = useAdmin();
  const { run, error, busy } = useAction(["moderation"]);
  const isSchoolAdmin = context?.role === "school_admin";
  const queue = useQuery({ queryKey: ["moderation"], enabled: isSchoolAdmin, queryFn: () => rpc<Item[]>("moderation_queue") });

  const resolve = (item: Item, action: "dismiss" | "hide" | "warn") =>
    run("resolve_reports", { p_target_type: item.target_type, p_target_id: item.target_id, p_action: action });

  const suspend = (item: Item) => {
    if (window.confirm(`Suspendre le compte de ${item.author_name ?? "cet étudiant"} ?`)) {
      run("admin_set_status", { p_user_id: item.target_user_id, p_status: "suspended" });
    }
  };

  return (
    <>
      <PageTitle title="Modération" subtitle="Les contenus signalés par les étudiants. Un contenu signalé 3 fois est masqué automatiquement en attendant votre décision." />
      {!isSchoolAdmin ? <Notice tone="info">La modération se fait depuis un compte admin de l&apos;école concernée.</Notice> : null}
      <Notice>{error || queue.error?.message}</Notice>
      {queue.data?.length === 0 ? <Notice tone="success">Aucun signalement en attente.</Notice> : null}
      <div className="space-y-4">
        {queue.data?.map((item) => (
          <Card key={`${item.target_type}-${item.target_id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{TYPES[item.target_type]}</Badge>
              <Badge tone="alert">
                {item.report_count} signalement{item.report_count > 1 ? "s" : ""}
              </Badge>
              {item.is_hidden ? <Badge tone="accent">Masqué</Badge> : null}
              <span className="text-xs text-night/60">depuis le {formatDate(item.first_reported_at)}</span>
            </div>
            <p className="mt-2 font-bold">{item.author_name ?? "Auteur inconnu"}</p>
            {item.preview ? <p className="mt-2 whitespace-pre-wrap rounded-xl bg-cream p-3 text-sm">{item.preview}</p> : null}
            <p className="mt-2 text-sm text-night/70">{item.reasons.map((reason) => REASONS[reason] ?? reason).join(", ")}</p>
            {item.comments.map((comment, index) => (
              <p key={index} className="text-sm italic text-night/70">
                « {comment} »
              </p>
            ))}
            <div className="mt-3 flex flex-wrap gap-2">
              {item.target_type !== "user" ? (
                <Button variant="danger" disabled={busy} onClick={() => resolve(item, "hide")}>
                  Masquer le contenu
                </Button>
              ) : null}
              <Button variant="secondary" disabled={busy} onClick={() => resolve(item, "warn")}>
                Avertir l&apos;auteur
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => suspend(item)}>
                Suspendre le compte
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => resolve(item, "dismiss")}>
                Rejeter le signalement
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
