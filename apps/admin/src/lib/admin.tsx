"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

// Uniquement la clé publique : toutes les opérations passent par des fonctions SQL qui vérifient le rôle.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "missing-key",
);

const MESSAGES: Record<string, string> = {
  not_admin: "Vous n'avez pas accès à cette page.",
  school_required: "Choisissez d'abord une école.",
  invalid_credentials: "Email ou mot de passe incorrect.",
  otp_expired: "Ce code est faux ou a expiré.",
  over_email_send_rate_limit: "Trop de codes demandés. Patientez une minute.",
  weak_password: "Mot de passe trop simple : 8 caractères minimum, avec une lettre et un chiffre.",
  invite_not_found: "Aucune invitation en attente pour cette adresse.",
  email_already_used: "Cette adresse a déjà un compte UNION.",
  email_invalid: "Cette adresse email n'est pas valide.",
  name_invalid: "Le nom est obligatoire.",
  announcement_quota: "Limite atteinte : 3 annonces par semaine au maximum.",
  announcement_invalid: "Titre (50 caractères max) et message (180 max) sont obligatoires.",
  user_unavailable: "Ce compte n'est plus disponible.",
  redemption_not_found: "Cette demande a déjà été traitée.",
  report_target_not_found: "Ce signalement a déjà été traité.",
  moderator_concerned: "Ce signalement vous concerne : un autre administrateur doit le traiter.",
  period_invalid: "La période choisie n'est pas valide.",
  schools_slug_key: "Cet identifiant d'école est déjà utilisé.",
};

export function friendly(error: unknown): string {
  const { code = "", message = "" } = (error ?? {}) as { code?: string; message?: string };
  if (/failed to fetch/i.test(message)) return "Connexion impossible. Vérifiez votre réseau.";
  return MESSAGES[code] ?? Object.entries(MESSAGES).find(([key]) => message.includes(key))?.[1] ?? `Une erreur est survenue. (${message || code})`;
}

/** Appelle une fonction SQL et lève une erreur lisible en cas d'échec. */
export async function rpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw new Error(friendly(error));
  return data as T;
}

export type AdminContext = {
  role: "school_admin" | "super_admin";
  first_name: string;
  school_id: string | null;
  schools: { id: string; name: string; is_active: boolean }[];
};

type AdminState = {
  /** undefined = session en cours de lecture. */
  session: Session | null | undefined;
  /** null = connecté mais sans droits admin (invitation pas encore acceptée, ou compte étudiant). */
  context: AdminContext | null | undefined;
  /** École affichée : celle de l'admin, ou celle choisie par le super-admin. */
  schoolId: string | null;
  schoolName: string;
  setSchoolId: (id: string) => void;
  refreshContext: () => Promise<unknown>;
  signOut: () => Promise<void>;
};

const Context = createContext<AdminState | null>(null);

function AdminStateProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [chosenSchool, setChosenSchool] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const contextQuery = useQuery({
    queryKey: ["admin-context", userId],
    enabled: Boolean(userId),
    queryFn: () => rpc<AdminContext | null>("admin_context"),
  });

  const value = useMemo<AdminState>(() => {
    const context = session === null ? null : contextQuery.data;
    const schoolId = context?.school_id ?? chosenSchool ?? context?.schools[0]?.id ?? null;
    return {
      session,
      context: session === undefined || (userId && contextQuery.isPending) ? undefined : (context ?? null),
      schoolId,
      schoolName: context?.schools.find((school) => school.id === schoolId)?.name ?? "",
      setSchoolId: setChosenSchool,
      refreshContext: () => contextQuery.refetch(),
      signOut: async () => {
        await supabase.auth.signOut({ scope: "local" });
        queryClient.clear();
      },
    };
  }, [session, userId, contextQuery, chosenSchool, queryClient]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000 } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <AdminStateProvider>{children}</AdminStateProvider>
    </QueryClientProvider>
  );
}

export function useAdmin() {
  const value = useContext(Context);
  if (!value) throw new Error("useAdmin doit être utilisé dans AdminProvider");
  return value;
}
