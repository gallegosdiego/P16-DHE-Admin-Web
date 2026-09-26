"use client";

import { useEffect } from "react";
import { cx } from "./cx";

export type LightboxPhoto = {
  id: number | string;
  url: string;
  /** Texto corto bajo la foto (p. ej. "Entrega · 3:15 p. m."). */
  caption?: string | null;
};

export type PhotoLightboxProps = {
  photos: LightboxPhoto[];
  /** Índice abierto; null = cerrado. */
  index: number | null;
  onChange: (index: number | null) => void;
};

/** Visor de fotos a pantalla completa con anterior/siguiente y cierre con Esc. */
export function PhotoLightbox({ photos, index, onChange }: PhotoLightboxProps) {
  const open = index !== null && index >= 0 && index < photos.length;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onChange(null);
      if (event.key === "ArrowRight" && index !== null) onChange((index + 1) % photos.length);
      if (event.key === "ArrowLeft" && index !== null) onChange((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, photos.length, onChange]);

  if (!open || index === null) return null;
  const photo = photos[index];
  const many = photos.length > 1;

  const navButton =
    "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-ink shadow-soft hover:bg-surface focus-visible:outline-2 focus-visible:outline-brand";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto ampliada"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-ink/85 p-4"
      onClick={() => onChange(null)}
    >
      <button
        type="button"
        aria-label="Cerrar foto"
        onClick={() => onChange(null)}
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface/90 text-ink hover:bg-surface"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-2">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      <figure className="flex max-h-full max-w-3xl flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt={photo.caption || "Foto del paquete"} className="max-h-[75dvh] w-auto rounded-card object-contain" />
        <figcaption className="text-center text-sm text-white">
          {photo.caption}
          {many ? <span className="ml-2 text-white/70">{index + 1} de {photos.length}</span> : null}
        </figcaption>
      </figure>
      {many ? (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            className={cx(navButton, "left-3")}
            onClick={(event) => {
              event.stopPropagation();
              onChange((index - 1 + photos.length) % photos.length);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-2">
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Foto siguiente"
            className={cx(navButton, "right-3")}
            onClick={(event) => {
              event.stopPropagation();
              onChange((index + 1) % photos.length);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-2">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </>
      ) : null}
    </div>
  );
}
