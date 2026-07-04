import { API_BASE_URL, fetchWithAuth } from "@/lib/auth";

const DEFAULT_TIMEOUT_MS = 15000;

type RequestOptions = {
  timeoutMs?: number;
  retries?: number;
  idempotent?: boolean;
};

type ApiPayload = {
  message?: string;
  error?: string;
  code?: string;
  retryable?: boolean;
  errors?: Record<string, string[]>;
  [key: string]: unknown;
};

const notifyNetworkError = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("dhe:api-network-error", {
      detail: { message: "Error de conexión. Verifica tu internet." },
    })
  );
};

const notifyAuthExpired = (message?: string) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("dhe:api-auth-expired", {
      detail: { message: message || "Sesión expirada. Vuelve a iniciar sesión." },
    })
  );
};

async function parseResponsePayload(response: Response): Promise<ApiPayload> {
  const text = await response.text();
  if (!text) return {};

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as ApiPayload;
    } catch {
      return { message: text };
    }
  }

  if (/^\s*</.test(text)) {
    return { message: `Respuesta no válida del servidor (${response.status})` };
  }

  try {
    return JSON.parse(text) as ApiPayload;
  } catch {
    return { message: text };
  }
}

function normalizeErrorMessage(
  method: string,
  path: string,
  response: Response,
  payload: ApiPayload
): Error {
  if (response.status === 401) {
    notifyAuthExpired(payload.message);
    return new Error(payload.message || "Sesión expirada. Vuelve a iniciar sesión.");
  }

  if (response.status === 403) {
    return new Error(payload.message || "No autorizado para realizar esta acción.");
  }

  if (payload.errors) {
    const firstField = Object.keys(payload.errors)[0];
    if (firstField) {
      return new Error(payload.errors[firstField][0] || payload.message || `${method} ${path} failed`);
    }
  }

  return new Error(
    payload.message
      || payload.error
      || (response.status >= 500 ? `Error del servidor en ${path}` : `${method} ${path} failed`)
  );
}

async function request<T>(
  path: string,
  init: RequestInit,
  options: RequestOptions = {}
): Promise<T> {
  const retries = options.retries ?? 0;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const canRetry = init.method === "GET" || options.idempotent === true;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchWithAuth(`${API_BASE_URL}${path}`, {
        ...init,
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const payload = await parseResponsePayload(response);

      if (!response.ok) {
        const error = normalizeErrorMessage(init.method || "GET", path, response, payload);
        const retryable = Boolean(payload.retryable) || [408, 429, 502, 503, 504].includes(response.status);

        if (attempt < retries && canRetry && retryable) {
          await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
          continue;
        }

        throw error;
      }

      return payload as T;
    } catch (error: unknown) {
      window.clearTimeout(timeout);
      const isAbort = error instanceof Error && error.name === "AbortError";
      const errorMessage = error instanceof Error ? error.message : String(error ?? "");
      const normalizedNetwork = isAbort
        ? new Error("El servidor tardó demasiado en responder.")
        : (error instanceof Error ? error : new Error(String(error ?? "Error desconocido")));
      const rawMessage = errorMessage.toLowerCase();
      const isNetworkFailure =
        isAbort
        || rawMessage.includes("network")
        || rawMessage.includes("failed to fetch")
        || rawMessage.includes("load failed");

      if (attempt < retries && canRetry && isNetworkFailure) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
        continue;
      }

      if (isNetworkFailure) {
        notifyNetworkError();
        throw new Error(isAbort ? "El servidor tardó demasiado en responder." : "Error de conexión. Verifica tu internet.");
      }

      throw normalizedNetwork;
    }
  }

  throw new Error(`No fue posible completar ${init.method || "GET"} ${path}`);
}

export async function apiGet<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T> {
  return request<T>(path, { method: "GET", ...(init ?? {}) }, { retries: 1, ...(options ?? {}) });
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body: Record<string, unknown>,
  options?: RequestOptions
): Promise<T> {
  const init: RequestInit = { method };

  if (method !== "DELETE" && body && Object.keys(body).length > 0) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (value === null || value === undefined) continue;
      if (value instanceof File || value instanceof Blob) {
        formData.append(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          formData.append(`${key}[${index}]`, String(item));
        });
      } else if (typeof value === "object") {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, String(value));
      }
    }

    if (method === "PUT") {
      formData.append("_method", "PUT");
      init.method = "POST";
    }

    init.body = formData;
  }

  return request<T>(path, init, options);
}
