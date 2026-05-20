"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { usePageTitle } from "@/lib/page-title";

export default function LoginPage() {
  usePageTitle("Login | Danhei Express");
  const router = useRouter();
  const { login, user, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && user) router.replace("/");
  }, [isLoading, user, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const result = await login({ email, password });
    if (!result.ok) {
      setError(result.message || "No fue posible iniciar sesión.");
    } else {
      router.replace("/");
    }
    setIsSubmitting(false);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-8 dark:bg-[#0a0a1a]">

      {/* ── Background design ────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Gradient blobs */}
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-[#D1007F]/8 blur-[120px] dark:bg-[#D1007F]/15" />
        <div className="absolute -bottom-60 -left-60 h-[600px] w-[600px] rounded-full bg-[#D1007F]/5 blur-[150px] dark:bg-[#D1007F]/10" />
        <div className="absolute top-1/3 left-1/2 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-violet-300/8 blur-[100px] dark:bg-violet-500/8" />

        {/* Dot grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.25] dark:opacity-[0.06]"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(209,0,127,0.3) 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
          }}
        />

        {/* Geometric accents — thin lines */}
        <svg className="absolute top-0 left-0 h-full w-full opacity-[0.04] dark:opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="login-grid" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#D1007F" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#login-grid)" />
        </svg>

        {/* Diagonal accent stripe */}
        <div className="absolute -right-20 top-20 h-[2px] w-[400px] rotate-[35deg] bg-gradient-to-r from-transparent via-[#D1007F]/20 to-transparent" />
        <div className="absolute -left-20 bottom-40 h-[2px] w-[350px] rotate-[35deg] bg-gradient-to-r from-transparent via-[#D1007F]/15 to-transparent" />

        {/* Floating circles */}
        <div className="absolute top-[15%] right-[20%] h-3 w-3 rounded-full bg-[#D1007F]/20 dark:bg-[#D1007F]/30" />
        <div className="absolute top-[60%] left-[15%] h-2 w-2 rounded-full bg-[#D1007F]/15 dark:bg-[#D1007F]/25" />
        <div className="absolute top-[80%] right-[30%] h-4 w-4 rounded-full border border-[#D1007F]/20 dark:border-[#D1007F]/30" />
        <div className="absolute top-[25%] left-[25%] h-5 w-5 rounded-full border border-[#D1007F]/10 dark:border-[#D1007F]/20" />
      </div>

      {/* ── Login card ───────────────────────────── */}
      <section className="relative z-10 w-full max-w-[420px]">
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-8 shadow-xl shadow-slate-200/50 backdrop-blur-xl dark:border-[#2a2a3e] dark:bg-[#12122a]/85 dark:shadow-black/30">

          {/* Logo */}
          <div className="mb-8 text-center">
            <img
              src="/danhei-logo.png"
              alt="Danhei Express"
              className="mx-auto h-12 object-contain dark:brightness-0 dark:invert"
            />
            <p className="mt-3 text-sm font-medium text-slate-400 dark:text-slate-500">
              Panel Administrativo
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                placeholder="admin@danheiexpress.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-[#D1007F] focus:ring-2 focus:ring-[#D1007F]/20 dark:border-[#2a2a3e] dark:bg-[#0a0a1a] dark:text-white dark:placeholder:text-slate-500"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 pr-11 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-[#D1007F] focus:ring-2 focus:ring-[#D1007F]/20 dark:border-[#2a2a3e] dark:bg-[#0a0a1a] dark:text-white dark:placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-all duration-150 hover:text-slate-600 active:scale-95 dark:hover:text-slate-200"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24M1 1l22 22" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error ? (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-500/20 dark:bg-red-500/10">
                <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0 fill-none stroke-red-500 stroke-2 dark:stroke-red-400">
                  <path d="M12 9v4M12 17h.01M12 3 22 20H2L12 3Z" />
                </svg>
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            ) : null}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-12 w-full rounded-xl bg-gradient-to-r from-[#D1007F] to-[#b8006f] text-sm font-bold tracking-wide text-white uppercase transition-all duration-200 hover:shadow-lg hover:shadow-[#D1007F]/30 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Validando...
                </span>
              ) : "Iniciar Sesión"}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 border-t border-slate-200 pt-4 text-center dark:border-[#2a2a3e]">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Danhei Express S.A.S. · Panel Interno
            </p>
          </div>
        </div>

        {/* Decorative glow beneath card */}
        <div className="absolute -bottom-4 left-1/2 h-8 w-3/4 -translate-x-1/2 rounded-full bg-[#D1007F]/10 blur-2xl" />
      </section>
    </main>
  );
}
