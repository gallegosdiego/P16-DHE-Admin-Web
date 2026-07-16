"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
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
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && user) router.replace("/");
  }, [isLoading, user, router]);

  // Auto-focus email input on mount
  useEffect(() => {
    if (!isLoading && !user) emailRef.current?.focus();
  }, [isLoading, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Completa correo y contraseña.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await login({ email: trimmedEmail, password });
      if (!result.ok) {
        setError(result.message || "No fue posible iniciar sesión.");
      } else {
        router.replace("/");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#3f3f3f] px-4 py-8">
      <Image
        src="/login-bg.png"
        alt=""
        aria-hidden="true"
        fill
        priority
        sizes="100vw"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-black/75 via-black/45 to-[#D1007F]/25" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.16),transparent_28%)]" />

      <section className="relative z-10 w-full max-w-[420px]" aria-label="Acceso al panel administrativo">
        <div className="rounded-2xl border border-white/70 bg-[#fff0f7]/94 p-8 shadow-[0_24px_70px_rgba(68,0,35,0.42),0_0_30px_rgba(209,0,127,0.16)] backdrop-blur-xl">
          <div className="mb-8 text-center">
            <Image
              src="/danhei-brand-adaptive.png"
              alt="Danhei Express"
              width={300}
              height={78}
              priority
              className="mx-auto h-16 w-auto max-w-full object-contain drop-shadow-[0_0_10px_rgba(209,0,127,0.38)]"
            />
            <p className="mt-4 text-base font-semibold text-[#43142f]">
              Danhei Express
            </p>
            <p className="mt-3 text-sm font-semibold text-[#7a365b]">
              Panel Administrativo
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-sm font-semibold text-[#4d1b36]"
              >
                Correo electrónico
              </label>
              <input
                ref={emailRef}
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="admin@danheiexpress.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="danhei-login-input h-11 w-full rounded-xl border px-4 text-sm shadow-sm outline-none transition-all focus:border-[#D1007F] focus:ring-2 focus:ring-[#D1007F]/20"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-sm font-semibold text-[#4d1b36]"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="danhei-login-input h-11 w-full rounded-xl border px-4 pr-11 text-sm shadow-sm outline-none transition-all focus:border-[#D1007F] focus:ring-2 focus:ring-[#D1007F]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#D1007F]/75 transition-all duration-150 hover:text-[#D1007F] active:scale-95"
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

            {error ? (
              <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50/90 px-3 py-2.5" role="alert">
                <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0 fill-none stroke-red-600 stroke-2">
                  <path d="M12 9v4M12 17h.01M12 3 22 20H2L12 3Z" />
                </svg>
                <p className="text-sm font-medium text-red-700">{error}</p>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="h-12 w-full rounded-xl bg-[#D1007F] text-sm font-bold uppercase tracking-wide text-white transition-all duration-200 hover:bg-[#b8006f] hover:shadow-lg hover:shadow-[#D1007F]/30 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
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

          <div className="mt-6 border-t border-[#e7b9d0] pt-4 text-center">
            <p className="text-xs font-medium text-[#87506e]">
              Danhei Express S.A.S. · Panel Interno
            </p>
          </div>
        </div>

        <div className="absolute -bottom-4 left-1/2 h-8 w-3/4 -translate-x-1/2 rounded-full bg-[#D1007F]/10 blur-2xl" />
      </section>
    </main>
  );
}
