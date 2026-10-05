// Coquille de la page de connexion (F-ADM-01). L'authentification arrive au lot 6.
export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-sm dark:bg-night">
        <h1 className="text-3xl font-extrabold text-coral">UNION</h1>
        <p className="mt-1 text-sm opacity-70">Espace établissement</p>

        <label className="mt-8 block text-sm font-semibold" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          disabled
          className="mt-1.5 h-12 w-full rounded-2xl border border-night/15 px-4 dark:border-cream/20"
        />

        <label className="mt-4 block text-sm font-semibold" htmlFor="password">
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          disabled
          className="mt-1.5 h-12 w-full rounded-2xl border border-night/15 px-4 dark:border-cream/20"
        />

        <button
          type="submit"
          disabled
          className="mt-6 h-12 w-full rounded-2xl bg-coral font-bold text-white opacity-40"
        >
          Se connecter
        </button>
        <p className="mt-4 text-center text-xs opacity-60">Connexion bientôt disponible.</p>
      </form>
    </main>
  );
}
