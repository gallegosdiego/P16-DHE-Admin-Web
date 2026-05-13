import { API_BASE_URL, fetchWithAuth } from "@/lib/auth";

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetchWithAuth(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new Error(`GET ${path} failed`);
  return response.json();
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PUT",
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetchWithAuth(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} failed`);
  return response.json();
}
