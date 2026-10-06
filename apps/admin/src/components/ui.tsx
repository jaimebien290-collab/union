import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const field =
  "h-11 w-full rounded-xl border border-night/15 bg-white px-3 text-base text-night outline-none focus:border-coral disabled:opacity-60";

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-extrabold text-night">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-night/70">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 print:hidden">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl bg-white p-5 shadow-sm ${className}`}>
      {title ? <h2 className="mb-3 text-lg font-bold text-night">{title}</h2> : null}
      {children}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" };

const buttonStyles = {
  primary: "bg-coral text-white",
  secondary: "border border-night/15 bg-white text-night",
  danger: "border border-coral text-coral",
  ghost: "text-coral",
};

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`h-11 rounded-xl px-4 text-sm font-bold transition-opacity hover:opacity-85 disabled:opacity-40 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-night">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-night/60">{hint}</span> : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${field} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${field} h-auto py-2 ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${field} ${props.className ?? ""}`} />;
}

export function Notice({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "info" | "success" }) {
  if (!children) return null;
  const tones = { error: "bg-coral/15", info: "bg-sun/25", success: "bg-emerald-100" };
  return (
    <p role="status" className={`rounded-xl px-4 py-3 text-sm font-semibold text-night ${tones[tone]}`}>
      {children}
    </p>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "alert" }) {
  const tones = { neutral: "bg-night/10 text-night", accent: "bg-sun text-night", alert: "bg-coral text-white" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

/** Tableau simple : en-têtes, puis une ligne par élément. */
export function Table({ headers, children, empty }: { headers: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-night/10 text-night/60">
            {headers.map((header) => (
              <th key={header} className="px-2 py-2 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:px-2 [&_td]:py-2.5 [&_tr]:border-b [&_tr]:border-night/5">{children}</tbody>
      </table>
      {empty ? <p className="py-6 text-center text-sm text-night/60">Rien à afficher pour l&apos;instant.</p> : null}
    </div>
  );
}

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
