"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button, Field, Input, Notice } from "@/components/ui";
import { friendly, rpc, supabase, useAdmin } from "@/lib/admin";

type Step = "email" | "code" | "password" | "name";

// Première connexion d'un admin invité (F-SUP-02) et mot de passe oublié : email → code reçu → mot de passe.
// Un admin invité renseigne ensuite son nom, ce qui crée son profil avec le rôle prévu par l'invitation.
export default function AccessPage() {
  const router = useRouter();
  const { refreshContext } = useAdmin();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setError("");
    setLoading(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : friendly(e));
    } finally {
      setLoading(false);
    }
  };

  const steps: Record<Step, { title: string; button: string; submit: () => Promise<void> }> = {
    email: {
      title: "Votre adresse email",
      button: "Recevoir un code",
      submit: async () => {
        const address = email.trim().toLowerCase();
        if (!(await rpc<boolean>("check_admin_email", { p_email: address }))) {
          throw new Error("Cette adresse n'a pas d'accès au back-office. Demandez une invitation à votre contact UNION.");
        }
        const { error } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
        if (error) throw new Error(friendly(error));
        setStep("code");
      },
    },
    code: {
      title: "Le code reçu par email",
      button: "Valider",
      submit: async () => {
        const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
        if (error) throw new Error(friendly(error));
        setStep("password");
      },
    },
    password: {
      title: "Choisissez votre mot de passe",
      button: "Continuer",
      submit: async () => {
        if (password.length < 8 || !/\p{L}/u.test(password) || !/\d/.test(password)) {
          throw new Error("8 caractères minimum, avec au moins une lettre et un chiffre.");
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error(friendly(error));
        // Compte admin déjà en place (mot de passe oublié) : direction le tableau de bord.
        if (await rpc("admin_context")) {
          await refreshContext();
          router.replace("/tableau-de-bord");
        } else setStep("name");
      },
    },
    name: {
      title: "Votre nom",
      button: "Accéder au back-office",
      submit: async () => {
        await rpc("accept_admin_invite", { p_first_name: firstName, p_last_name: lastName });
        await refreshContext();
        router.replace("/tableau-de-bord");
      },
    },
  };

  const current = steps[step];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(current.submit);
  };

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-3xl font-extrabold text-coral">UNION</h1>
          <p className="text-sm text-night/70">{current.title}</p>
        </div>
        {step === "email" ? (
          <Field label="Email professionnel" hint="Celui sur lequel vous avez été invité.">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        ) : null}
        {step === "code" ? (
          <Field label="Code à 6 chiffres" hint={`Envoyé à ${email}. Pensez à regarder vos courriers indésirables.`}>
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </Field>
        ) : null}
        {step === "password" ? (
          <Field label="Mot de passe" hint="8 caractères minimum, avec une lettre et un chiffre.">
            <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        ) : null}
        {step === "name" ? (
          <>
            <Field label="Prénom">
              <Input autoComplete="given-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Nom">
              <Input autoComplete="family-name" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </>
        ) : null}
        <Notice>{error}</Notice>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Un instant…" : current.button}
        </Button>
        <p className="text-center text-sm">
          <Link href="/" className="font-semibold text-coral">
            Retour à la connexion
          </Link>
        </p>
      </form>
    </main>
  );
}
