"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { Button, Field, Input, Notice } from "@/components/ui";
import { friendly, supabase, useAdmin } from "@/lib/admin";

// F-ADM-01 : connexion des admins (email + mot de passe). Les comptes se créent par invitation, voir /acces.
export default function LoginPage() {
  const router = useRouter();
  const { session, context } = useAdmin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session && context) router.replace("/tableau-de-bord");
  }, [session, context, router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setLoading(false);
    if (error) setError(friendly(error));
  };

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-3xl font-extrabold text-coral">UNION</h1>
          <p className="text-sm text-night/70">Espace établissement</p>
        </div>
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mot de passe">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Notice>{error}</Notice>
        {session && context === null ? (
          <Notice>Ce compte n&apos;a pas accès au back-office. Si vous avez été invité, passez par « Première connexion ».</Notice>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Connexion…" : "Se connecter"}
        </Button>
        <p className="text-center text-sm">
          <Link href="/acces" className="font-semibold text-coral">
            Première connexion ou mot de passe oublié
          </Link>
        </p>
      </form>
    </main>
  );
}
