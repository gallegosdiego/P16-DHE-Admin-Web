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
        formData.append(
          key,
          typeof value === "object" ? JSON.stringify(value) : String(value)
        );
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
    throw new Error(errorData.message || `${method} ${path} failed`);
  }
  return response.json();
}
