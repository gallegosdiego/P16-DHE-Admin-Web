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
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8"
      style={{ backgroundImage: "url('/login-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }}
    >
      {/* Dark overlay for readability */}
      <div className="pointer-events-none absolute inset-0 bg-black/40" />

      {/* ── Login card ───────────────────────────── */}
      <section className="relative z-10 w-full max-w-[420px]">
        <div className="rounded-2xl border border-white/10 bg-black/50 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">

          {/* Logo */}
          <div className="mb-8 text-center">
            <img
              src="/danhei-logo.png"
              alt="Danhei Express"
              className="mx-auto h-12 object-contain brightness-0 invert"
            />
            <p className="mt-3 text-sm font-medium text-slate-300">
              Panel Administrativo
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-slate-200"
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
                className="h-11 w-full rounded-xl border border-white/15 bg-white/10 px-4 text-sm text-white placeholder:text-slate-400 outline-none transition-all focus:border-[#D1007F] focus:ring-2 focus:ring-[#D1007F]/25"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-slate-200"
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
                  className="h-11 w-full rounded-xl border border-white/15 bg-white/10 px-4 pr-11 text-sm text-white placeholder:text-slate-400 outline-none transition-all focus:border-[#D1007F] focus:ring-2 focus:ring-[#D1007F]/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-all duration-150 hover:text-white active:scale-95"
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
              <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5">
                <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0 fill-none stroke-red-400 stroke-2">
                  <path d="M12 9v4M12 17h.01M12 3 22 20H2L12 3Z" />
                </svg>
                <p className="text-sm text-red-400">{error}</p>
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
          <div className="mt-6 border-t border-white/10 pt-4 text-center">
            <p className="text-xs text-slate-400">
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
