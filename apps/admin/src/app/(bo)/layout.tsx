"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { Select } from "@/components/ui";
import { useAdmin } from "@/lib/admin";

const NAV = [
  { href: "/tableau-de-bord", label: "Tableau de bord" },
  { href: "/etudiants", label: "Étudiants" },
  { href: "/moderation", label: "Modération" },
  { href: "/activites", label: "Activités officielles" },
  { href: "/annonces", label: "Annonces" },
  { href: "/goodies", label: "Goodies" },
  { href: "/ressources", label: "Ressources d'écoute" },
  { href: "/parametres", label: "Paramètres" },
];

// Tout ce qui est sous (bo) exige un compte admin. Le super-admin choisit l'école qu'il consulte.
export default function BackOfficeLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, context, schoolId, setSchoolId, signOut } = useAdmin();

  useEffect(() => {
    if (session === null || (session && context === null)) router.replace("/");
  }, [session, context, router]);

  if (!context) {
    return <main className="flex flex-1 items-center justify-center text-night/60">Chargement…</main>;
  }

  const links = context.role === "super_admin" ? [...NAV, { href: "/plateforme", label: "Plateforme" }] : NAV;

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 bg-white p-4 md:w-60 print:hidden">
        <div>
          <p className="text-2xl font-extrabold text-coral">UNION</p>
          <p className="text-xs text-night/60">Bonjour {context.first_name}</p>
        </div>
        {context.role === "super_admin" ? (
          <Select aria-label="École consultée" value={schoolId ?? ""} onChange={(e) => setSchoolId(e.target.value)}>
            {context.schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
                {school.is_active ? "" : " (inactive)"}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm font-bold text-night">{context.schools[0]?.name}</p>
        )}
        <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${pathname === link.href ? "bg-coral text-white" : "text-night hover:bg-cream"}`}>
              {link.label}
            </Link>
          ))}
        </nav>
        <button type="button" onClick={signOut} className="mt-auto text-left text-sm font-semibold text-night/60 hover:text-coral">
          Se déconnecter
        </button>
      </aside>
      <main className="min-w-0 flex-1 p-5 md:p-8">{children}</main>
    </div>
  );
}
