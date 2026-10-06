"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { rpc } from "@/lib/admin";

/** Exécute une fonction SQL, rafraîchit les listes concernées et expose l'erreur ou le message de succès. */
export function useAction(invalidate: string[]) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async <T,>(fn: string, params: Record<string, unknown>, done?: string | ((result: T) => string)): Promise<boolean> => {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const result = await rpc<T>(fn, params);
      await Promise.all(invalidate.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      if (done) setSuccess(typeof done === "string" ? done : done(result));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { run, error, success, busy };
}
