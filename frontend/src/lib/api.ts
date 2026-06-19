import { API_BASE_URL, fetchWithAuth } from "@/lib/auth";

const notifyNetworkError = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("dhe:api-network-error", {
      detail: { message: "Error de conexion. Verifica tu internet." },
    })
  );
};

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithAuth(`${API_BASE_URL}${path}`, init);
  } catch {
    notifyNetworkError();
    throw new Error(`GET ${path} network failed`);
  }
  if (!response.ok) throw new Error(`GET ${path} failed`);
  return response.json();
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body: Record<string, unknown>
): Promise<T> {
  let response: Response;
  try {
    // DELETE no necesita body; POST/PUT usan FormData
    // porque LiteSpeed no parsea application/json correctamente
    const init: RequestInit = { method };

    if (method !== "DELETE" && body && Object.keys(body).length > 0) {
      const formData = new FormData();
      for (const [key, value] of Object.entries(body)) {
        if (value === null || value === undefined) continue;
        // File/Blob se adjuntan directamente (multipart upload)
        if (value instanceof File || value instanceof Blob) {
          formData.append(key, value);
        } else if (Array.isArray(value)) {
          // Laravel espera arrays como key[0]=val, key[1]=val (no JSON string)
          value.forEach((item, index) => {
            formData.append(`${key}[${index}]`, String(item));
          });
        } else if (typeof value === "object") {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
      // PUT con FormData necesita _method spoofing en Laravel
      if (method === "PUT") {
        formData.append("_method", "PUT");
        init.method = "POST";
      }
      init.body = formData;
    }

    response = await fetchWithAuth(`${API_BASE_URL}${path}`, init);
  } catch {
    notifyNetworkError();
    throw new Error(`${method} ${path} network failed`);
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    // Laravel validation errors come in 'errors' object
    let msg = errorData.message || `${method} ${path} failed`;
    if (errorData.errors) {
      const firstField = Object.keys(errorData.errors)[0];
      if (firstField) {
        msg = `${msg}: ${errorData.errors[firstField][0]}`;
      }
    }
    throw new Error(msg);
  }
  return response.json();
}
