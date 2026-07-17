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
  error_id?: string;
  request_id?: string;
  errors?: Record<string, string[]>;
  required_action?: string;
  missing_tables?: unknown;
  missing_tables_count?: unknown;
  missing_columns_count?: unknown;
  deployment?: unknown;
  [key: string]: unknown;
};

type ApiRequestErrorOptions = {
  method: string;
  path: string;
  status?: number;
  code?: string;
  errorId?: string;
  retryable?: boolean;
  fieldErrors?: Record<string, string[]>;
  requiredAction?: string;
  missingTablesCount?: number;
  missingColumnsCount?: number;
  deployment?: ApiDeploymentStatus;
};

export type ApiDeploymentStatus = {
  status: "success" | "failed" | "running" | "unknown";
  commit?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  phase?: string;
  exitCode?: number;
};

export class ApiRequestError extends Error {
  readonly method: string;
  readonly path: string;
  readonly status?: number;
  readonly code?: string;
  readonly errorId?: string;
  readonly retryable: boolean;
  readonly fieldErrors?: Record<string, string[]>;
  readonly requiredAction?: string;
  readonly missingTablesCount?: number;
  readonly missingColumnsCount?: number;
  readonly deployment?: ApiDeploymentStatus;

  constructor(message: string, options: ApiRequestErrorOptions) {
    super(message);
    this.name = "ApiRequestError";
    this.method = options.method;
    this.path = options.path;
    this.status = options.status;
    this.code = options.code;
    this.errorId = options.errorId;
    this.retryable = options.retryable ?? false;
    this.fieldErrors = options.fieldErrors;
    this.requiredAction = options.requiredAction;
    this.missingTablesCount = options.missingTablesCount;
    this.missingColumnsCount = options.missingColumnsCount;
    this.deployment = options.deployment;
  }
}

export type ApiErrorPresentation = {
  message: string;
  code?: string;
  reference?: string;
  retryable: boolean;
  status?: number;
  requiredAction?: string;
  missingComponentsCount?: number;
  deployment?: ApiDeploymentStatus;
};

export function describeApiError(
  error: unknown,
  fallbackMessage: string
): ApiErrorPresentation {
  if (error instanceof ApiRequestError) {
    return {
      message: error.message || fallbackMessage,
      code: error.code,
      reference: error.errorId,
      retryable: error.retryable,
      status: error.status,
      requiredAction: error.requiredAction,
      missingComponentsCount: (error.missingTablesCount ?? 0) + (error.missingColumnsCount ?? 0),
      deployment: error.deployment,
    };
  }

  return {
    message: error instanceof Error && error.message.trim()
      ? error.message
      : fallbackMessage,
    retryable: false,
  };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function normalizeDeployment(value: unknown): ApiDeploymentStatus | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const record = value as Record<string, unknown>;
  const rawStatus = nonEmptyString(record.status);
  const status = rawStatus && ["success", "failed", "running"].includes(rawStatus)
    ? rawStatus as ApiDeploymentStatus["status"]
    : "unknown";

  return {
    status,
    commit: nonEmptyString(record.commit),
    startedAt: nonEmptyString(record.started_at),
    completedAt: nonEmptyString(record.completed_at),
    failedAt: nonEmptyString(record.failed_at),
    phase: nonEmptyString(record.phase),
    exitCode: nonNegativeInteger(record.exit_code),
  };
}

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
): ApiRequestError {
  const code = nonEmptyString(payload.code);
  const errorId = nonEmptyString(payload.error_id) || nonEmptyString(payload.request_id);
  const retryable = Boolean(payload.retryable) || [408, 429, 502, 503, 504].includes(response.status);
  const missingTablesCount = nonNegativeInteger(payload.missing_tables_count)
    ?? (Array.isArray(payload.missing_tables) ? payload.missing_tables.length : undefined);
  const buildError = (message: string) => new ApiRequestError(message, {
    method,
    path,
    status: response.status,
    code,
    errorId,
    retryable,
    fieldErrors: payload.errors,
    requiredAction: nonEmptyString(payload.required_action),
    missingTablesCount,
    missingColumnsCount: nonNegativeInteger(payload.missing_columns_count),
    deployment: normalizeDeployment(payload.deployment),
  });

  if (response.status === 401) {
    notifyAuthExpired(payload.message);
    return buildError(payload.message || "Sesión expirada. Vuelve a iniciar sesión.");
  }

  if (response.status === 403) {
    return buildError(payload.message || "No autorizado para realizar esta acción.");
  }

  if (payload.errors) {
    const firstField = Object.keys(payload.errors)[0];
    if (firstField) {
      return buildError(payload.errors[firstField][0] || payload.message || "Revisa los datos enviados.");
    }
  }

  const publicServerMessage = response.status < 500 || code
    ? nonEmptyString(payload.message)
    : undefined;
  const safeMessage = publicServerMessage
    || (response.status < 500 ? nonEmptyString(payload.error) : undefined)
    || (response.status >= 500
      ? "El servidor no pudo completar la solicitud."
      : "No fue posible completar la solicitud.");

  return buildError(safeMessage);
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

        if (attempt < retries && canRetry && error.retryable) {
          await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
          continue;
        }

        throw error;
      }

      return payload as T;
    } catch (error: unknown) {
      window.clearTimeout(timeout);
      if (error instanceof ApiRequestError) {
        throw error;
      }

      const isAbort = error instanceof Error && error.name === "AbortError";
      const errorMessage = error instanceof Error ? error.message : String(error ?? "");
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
        throw new ApiRequestError(
          isAbort
            ? "El servidor tardó demasiado en responder."
            : "Error de conexión. Verifica tu internet.",
          {
            method: init.method || "GET",
            path,
            code: isAbort ? "request_timeout" : "network_error",
            retryable: true,
          }
        );
      }

      throw new ApiRequestError(
        error instanceof Error && error.message
          ? error.message
          : "No fue posible completar la solicitud.",
        {
          method: init.method || "GET",
          path,
          code: "client_request_error",
          retryable: false,
        }
      );
    }
  }

  throw new ApiRequestError("No fue posible completar la solicitud.", {
    method: init.method || "GET",
    path,
    code: "request_exhausted",
    retryable: false,
  });
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

export async function apiJson<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body: Record<string, unknown>,
  headers?: HeadersInit,
  options?: RequestOptions
): Promise<T> {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");

  return request<T>(path, {
    method,
    headers: requestHeaders,
    body: JSON.stringify(body),
  }, options);
}
