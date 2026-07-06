import { API_BASE_URL } from "@/lib/auth";

const API_PUBLIC_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");

export function resolveApiAssetUrl(input?: string | null): string | null {
  const value = input?.trim();
  if (!value) return null;
  if (/^(data:|blob:)/i.test(value)) return value;

  try {
    if (/^https?:\/\//i.test(value)) {
      const parsed = new URL(value);
      if (/^\/storage\//i.test(parsed.pathname)) {
        return `${API_PUBLIC_BASE_URL}${parsed.pathname}`;
      }
      return value;
    }

    if (/^\//.test(value)) {
      return `${API_PUBLIC_BASE_URL}${value}`;
    }

    return `${API_PUBLIC_BASE_URL}/storage/${value.replace(/^storage\/+/i, "").replace(/^\/+/, "")}`;
  } catch {
    return value;
  }
}
