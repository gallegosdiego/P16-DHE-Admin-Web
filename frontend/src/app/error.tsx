"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-[#0f0f23]">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">
          Ocurrio un error inesperado
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {error?.message || "No pudimos renderizar esta vista correctamente."}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
