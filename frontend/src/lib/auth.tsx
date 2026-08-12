"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@/lib/types";

const DEV_API_BASE_URL = "http://127.0.0.1:8000/api";
const PROD_API_BASE_URL = "https://api.danheiexpress.com/api";

function normalizeApiBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function isLocalApiUrl(url: string): boolean {
  return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(url);
}

/** ¿El panel se está ejecutando en la máquina de quien lo mira? */
function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/**
 * A qué API debe hablar el panel.
 *
 * La regla es: **solo se usa la API local si el propio panel corre en local.**
 * En cualquier otro caso manda la de producción.
 *
 * Antes se preguntaba lo contrario —«¿el dominio es de danheiexpress.com?»— y
 * todo lo demás caía en `127.0.0.1:8000`. Eso significaba que abrir el panel
 * desde una vista previa de Vercel, un dominio nuevo o un acceso directo con
 * otra URL hacía que el navegador intentara hablar con el propio dispositivo
 * del usuario, produciendo un «Error de conexión con auth API» que no daba
 * ninguna pista de la causa real. Un despliegue en un dominio no previsto debe
 * funcionar, no fallar de forma inexplicable.
 */
function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  const host =
    typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  const runningLocally = isLocalHost(host);

  if (configured) {
    const normalizedConfigured = normalizeApiBaseUrl(configured);
    // Una API local configurada solo tiene sentido si el panel también es local.
    // Si no, es configuración de desarrollo que se coló en un despliegue.
    if (! runningLocally && isLocalApiUrl(normalizedConfigured)) {
      return PROD_API_BASE_URL;
    }
    return normalizedConfigured;
  }

  return runningLocally ? DEV_API_BASE_URL : PROD_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();
const AUTH_TOKEN_KEY = "dhe_auth_token";

type LoginInput = {
  email: string;
  password: string;
};

type AuthContextValue = {
  user: Partial<User> | null;
  token: string | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const syncTokenCookie = (token: string | null) => {
  if (!token) {
    document.cookie =
      "dhe_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    return;
  }
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `dhe_auth_token=${encodeURIComponent(token)}; path=/; max-age=2592000; samesite=lax${secure}`;
};

const normalizeUser = (payload: unknown): Partial<User> | null => {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  if ("user" in data && typeof data.user === "object" && data.user) {
    return data.user as Partial<User>;
  }
  return data as Partial<User>;
};

export async function fetchWithAuth(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Partial<User> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    syncTokenCookie(null);
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async ({ email, password }: LoginInput) => {
    try {
      // FormData porque LiteSpeed no parsea application/json
      const formData = new FormData();
      formData.append("email", email);
      formData.append("password", password);
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });

      const payload = await response.json();
      const nextToken = payload?.token as string | undefined;

      if (!response.ok || !nextToken) {
        const backendMsg =
          (payload?.message as string) ||
          (payload?.error as string) ||
          "Credenciales inválidas.";
        return { ok: false, message: backendMsg };
      }

      localStorage.setItem(AUTH_TOKEN_KEY, nextToken);
      syncTokenCookie(nextToken);
      setToken(nextToken);

      const profile = await fetch(`${API_BASE_URL}/me`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${nextToken}`,
        },
      });

      if (!profile.ok) {
        logout();
        return { ok: false, message: "No fue posible validar la sesión." };
      }

      const profilePayload = await profile.json();
      setUser(normalizeUser(profilePayload));
      return { ok: true };
    } catch {
      return { ok: false, message: "Error de conexión con auth API." };
    }
  }, [logout]);

  useEffect(() => {
    const onAuthExpired = () => logout();
    window.addEventListener("dhe:api-auth-expired", onAuthExpired);
    return () => window.removeEventListener("dhe:api-auth-expired", onAuthExpired);
  }, [logout]);

  useEffect(() => {
    const bootstrap = async () => {
      const savedToken = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!savedToken) {
        setIsLoading(false);
        return;
      }
      setToken(savedToken);
      syncTokenCookie(savedToken);
      try {
        const response = await fetch(`${API_BASE_URL}/me`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${savedToken}`,
          },
        });
        if (!response.ok) {
          logout();
          return;
        }
        const payload = await response.json();
        setUser(normalizeUser(payload));
      } catch {
        logout();
      } finally {
        setIsLoading(false);
      }
    };
    bootstrap();
  }, [logout]);

  const value = useMemo(
    () => ({ user, token, isLoading, login, logout }),
    [user, token, isLoading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
