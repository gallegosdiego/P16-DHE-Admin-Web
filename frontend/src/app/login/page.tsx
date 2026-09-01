"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/page-title";
import { Button } from "@/components/ui";

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
        <div className="rounded-card bg-white/95 p-8 shadow-[0_24px_70px_rgba(68,0,35,0.42),0_0_30px_rgba(209,0,127,0.16)] backdrop-blur-xl">
          <div className="mb-8 text-center">
            <Image
              src="/danhei-brand-adaptive.png"
              alt="Danhei Express"
              width={300}
              height={78}
              priority
              className="mx-auto h-16 w-auto max-w-full object-contain drop-shadow-[0_0_10px_rgba(209,0,127,0.38)]"
            />
            <p className="mt-4 text-base font-semibold text-ink/80">
              Danhei Express
            </p>
            <p className="mt-3 text-sm font-semibold text-brand">
              Panel Administrativo
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-sm font-semibold text-ink/80"
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
                className="h-11 w-full rounded-button border border-edge bg-white px-4 text-sm text-ink shadow-sm outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-sm font-semibold text-ink/80"
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
                  className="h-11 w-full rounded-button border border-edge bg-white px-4 pr-11 text-sm text-ink shadow-sm outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand/60 transition-all duration-150 hover:text-brand active:scale-95"
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
              <div className="flex items-center gap-2 rounded-button border border-danger/30 bg-danger/5 px-3 py-2.5" role="alert">
                <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0 fill-none stroke-danger stroke-2">
                  <path d="M12 9v4M12 17h.01M12 3 22 20H2L12 3Z" />
                </svg>
                <p className="text-sm font-medium text-danger">{error}</p>
              </div>
            ) : null}

            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="w-full uppercase tracking-wide"
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
            </Button>
          </form>

          <div className="mt-6 border-t border-edge pt-4 text-center">
            <p className="text-xs font-medium text-ink/50">
              Danhei Express S.A.S. · Panel Interno
            </p>
          </div>
        </div>

        <div className="absolute -bottom-4 left-1/2 h-8 w-3/4 -translate-x-1/2 rounded-full bg-brand/10 blur-2xl" />
      </section>
    </main>
  );
}
