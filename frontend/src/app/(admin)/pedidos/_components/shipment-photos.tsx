"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Button, Card, PhotoLightbox } from "@/components/ui";
import { formatTimelineWhen, type ShipmentPhoto } from "@/lib/shipment-timeline";

export const MAX_UPLOAD_PHOTOS = 6;

type ShipmentPhotosProps = {
  photos: ShipmentPhoto[];
  /** Muestra "Agregar foto" (se oculta si la API aún no lo permite). */
  canUpload: boolean;
  uploading: boolean;
  onUpload: (files: File[]) => void;
};

export function ShipmentPhotos({ photos, canUpload, uploading, onUpload }: ShipmentPhotosProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) onUpload(files);
  };

  return (
    <Card
      title="Fotos"
      headerAction={
        canUpload ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={handleFiles}
              data-testid="add-photo-input"
            />
            <Button variant="secondary" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? "Subiendo..." : "Agregar foto"}
            </Button>
          </>
        ) : null
      }
    >
      {photos.length === 0 ? (
        <p className="text-sm text-ink-secondary">Este paquete todavía no tiene fotos.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label="Fotos del paquete">
          {photos.map((photo, index) => (
            <li key={`${photo.group}-${photo.id}-${index}`}>
              <button
                type="button"
                onClick={() => setOpenIndex(index)}
                className="group block w-full overflow-hidden rounded-card border border-edge bg-app-secondary text-left focus-visible:outline-2 focus-visible:outline-brand"
                aria-label={`Ver foto: ${photo.label}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={photo.label} loading="lazy" className="aspect-square w-full object-cover" />
                <span className="block truncate px-2 py-1 text-xs font-semibold text-ink-secondary">{photo.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <PhotoLightbox
        photos={photos.map((photo) => ({
          id: photo.id,
          url: photo.url,
          caption: photo.at ? `${photo.label} · ${formatTimelineWhen(photo.at)}` : photo.label,
        }))}
        index={openIndex}
        onChange={setOpenIndex}
      />
    </Card>
  );
}
