import { createContext, type ReactNode, useContext, useState } from 'react';

import type { CategoryCode } from '@union/shared';

// Ce que l'étudiant a saisi d'un écran à l'autre pendant l'inscription, envoyé d'un coup à complete_signup.
export type SignupDraft = {
  email: string;
  /** « reset » = mot de passe oublié : on n'autorise pas la création de compte. */
  mode: 'signup' | 'reset';
  firstName: string;
  lastName: string;
  birthDate: string; // AAAA-MM-JJ
  program: string;
  studyYear: number | null;
  isNewcomer: boolean;
  interests: CategoryCode[];
};

const empty: SignupDraft = {
  email: '',
  mode: 'signup',
  firstName: '',
  lastName: '',
  birthDate: '',
  program: '',
  studyYear: null,
  isNewcomer: false,
  interests: [],
};

const Context = createContext<{ draft: SignupDraft; update: (patch: Partial<SignupDraft>) => void } | null>(null);

export function SignupDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(empty);
  return (
    <Context.Provider value={{ draft, update: (patch) => setDraft((current) => ({ ...current, ...patch })) }}>
      {children}
    </Context.Provider>
  );
}

export function useSignupDraft() {
  const value = useContext(Context);
  if (!value) throw new Error('useSignupDraft doit être utilisé dans SignupDraftProvider');
  return value;
}
