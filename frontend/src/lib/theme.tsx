"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
};

const THEME_KEY = "dhe_theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveDefaultTheme(): Theme {
  // Modo oscuro EN PAUSA (acta DECISIONES-REDISENO-UI-2026-09-01): se fuerza
  // claro ignorando la preferencia guardada. La paleta oscura no existe sobre
  // el design system v2, así que un "dark" heredado de la UI anterior dejaba
  // la interfaz mezclada (parches oscuros legacy bajo componentes claros
  // nuevos) y, con el toggle oculto, sin forma de salir. La preferencia
  // guardada no se borra: se retomará cuando el oscuro se reorganice.
  return "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => resolveDefaultTheme());

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  // La preferencia solo se persiste ante una acción explícita del usuario,
  // nunca por el arranque: así el "dark" guardado sobrevive a la pausa.
  const setTheme = (next: Theme) => {
    localStorage.setItem(THEME_KEY, next);
    setThemeState(next);
  };
  const toggleTheme = () =>
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      return next;
    });

  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
