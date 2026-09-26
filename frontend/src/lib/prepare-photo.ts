/** Fotos: valida el tipo y comprime en el navegador si pesa demasiado. */

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const PHOTO_MAX_EDGE = 1600;

export async function preparePhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecciona una imagen valida.");
  }

  const supportedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
  if (file.size <= MAX_PHOTO_BYTES && supportedMimeTypes.includes(file.type)) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("No se pudo optimizar la foto. Intenta con JPG, PNG o WEBP.");
  }

  const maxEdge = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, PHOTO_MAX_EDGE / maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("No se pudo preparar la foto.");
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (nextBlob) resolve(nextBlob);
        else reject(new Error("No se pudo comprimir la foto."));
      },
      "image/jpeg",
      0.78
    );
  });

  if (blob.size > MAX_PHOTO_BYTES) {
    throw new Error("La foto sigue pesando demasiado. Usa una imagen mas liviana.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "foto-paquete";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
