import { API_BASE_URL, fetchWithAuth } from "@/lib/auth";

const notifyNetworkError = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("dhe:api-network-error", {
      detail: { message: "Error de conexion. Verifica tu internet." },
    })
  );
};

export async function apiGet<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithAuth(`${API_BASE_URL}${path}`);
  } catch {
    notifyNetworkError();
    throw new Error(`GET ${path} network failed`);
  }
  if (!response.ok) throw new Error(`GET ${path} failed`);
  return response.json();
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PUT",
  body: Record<string, unknown>
): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithAuth(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    notifyNetworkError();
    throw new Error(`${method} ${path} network failed`);
  }
  if (!response.ok) throw new Error(`${method} ${path} failed`);
  return response.json();
}
