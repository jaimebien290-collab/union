"use client";

import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { Badge, Button, Card, Field, Input, Notice, PageTitle, Table, Textarea, formatDate } from "@/components/ui";
import { rpc, useAdmin } from "@/lib/admin";
import { useAction } from "@/lib/use-action";

type Reward = { id: string; name: string; description: string | null; image_url: string | null; cost_points: number; stock: number; is_active: boolean };
type Redemption = { id: string; reward: string; student: string; pickup_code: string; status: "pending" | "delivered" | "cancelled"; cost_points: number; created_at: string };

const EMPTY = { id: null as string | null, name: "", description: "", cost_points: "100", stock: "10", is_active: true };
const STATUS = { pending: "À remettre", delivered: "Remis", cancelled: "Annulé" };

// F-ADM-06 : catalogue de goodies, stock, et remise sur présentation du code de retrait.
export default function GoodiesPage() {
  const { schoolId } = useAdmin();
  const [form, setForm] = useState(EMPTY);
  const { run, error, busy } = useAction(["rewards", "redemptions"]);
  const rewards = useQuery({ queryKey: ["rewards", schoolId], enabled: Boolean(schoolId), queryFn: () => rpc<Reward[]>("admin_list_rewards", { p_school_id: schoolId }) });
  const redemptions = useQuery({
    queryKey: ["redemptions", schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => rpc<Redemption[]>("admin_list_redemptions", { p_school_id: schoolId }),
  });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await run("admin_save_reward", {
      p_school_id: schoolId,
      p_id: form.id,
      p_name: form.name,
      p_description: form.description,
      p_image_url: null,
      p_cost_points: Number(form.cost_points),
      p_stock: Number(form.stock),
      p_is_active: form.is_active,
    });
    if (saved) setForm(EMPTY);
  };

  return (
    <>
      <PageTitle title="Goodies" subtitle="Les étudiants échangent leurs points contre un goodie et reçoivent un code de retrait à présenter, par exemple au BDE." />
      <Notice>{error || rewards.error?.message}</Notice>

      <Card title="Demandes de retrait" className="mb-6">
        <Table headers={["Code", "Goodie", "Étudiant", "Demandé le", "État", ""]} empty={redemptions.data?.length === 0}>
          {redemptions.data?.map((redemption) => (
            <tr key={redemption.id}>
              <td className="font-mono text-base font-bold">{redemption.pickup_code}</td>
              <td>{redemption.reward}</td>
              <td>{redemption.student}</td>
              <td>{formatDate(redemption.created_at)}</td>
              <td>
                <Badge tone={redemption.status === "pending" ? "accent" : "neutral"}>{STATUS[redemption.status]}</Badge>
              </td>
              <td className="space-x-2 text-right whitespace-nowrap">
                {redemption.status === "pending" ? (
                  <>
                    <Button disabled={busy} onClick={() => run("admin_set_redemption", { p_id: redemption.id, p_status: "delivered" })}>
                      Remis
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        window.confirm(`Annuler ce retrait ? Les ${redemption.cost_points} points seront rendus à ${redemption.student}.`) &&
                        run("admin_set_redemption", { p_id: redemption.id, p_status: "cancelled" })
                      }>
                      Annuler
                    </Button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card title="Catalogue">
          <Table headers={["Goodie", "Coût", "Stock", "", ""]} empty={rewards.data?.length === 0}>
            {rewards.data?.map((reward) => (
              <tr key={reward.id}>
                <td>
                  <p className="font-semibold">{reward.name}</p>
                  <p className="text-xs text-night/60">{reward.description}</p>
                </td>
                <td>{reward.cost_points} pts</td>
                <td>{reward.stock}</td>
                <td>{reward.is_active ? null : <Badge>Masqué</Badge>}</td>
                <td className="text-right">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setForm({
                        id: reward.id,
                        name: reward.name,
                        description: reward.description ?? "",
                        cost_points: String(reward.cost_points),
                        stock: String(reward.stock),
                        is_active: reward.is_active,
                      })
                    }>
                    Modifier
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={form.id ? "Modifier le goodie" : "Ajouter un goodie"}>
          <form onSubmit={save} className="space-y-3">
            <Field label="Nom">
              <Input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Gourde UNION" />
            </Field>
            <Field label="Description">
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Coût en points">
              <Input type="number" min={1} required value={form.cost_points} onChange={(e) => setForm({ ...form, cost_points: e.target.value })} />
            </Field>
            <Field label="Stock">
              <Input type="number" min={0} required value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Visible dans l&apos;app
            </label>
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
