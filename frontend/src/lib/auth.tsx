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

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
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
