import { useCallback, useEffect, useState } from "react";

export type ColorScheme = "system" | "light" | "dark";

const storageKey = "wwpp:colorScheme";
const darkQuery = "(prefers-color-scheme: dark)";

function readStored(): ColorScheme {
  const stored = window.localStorage.getItem(storageKey);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function resolve(scheme: ColorScheme): "light" | "dark" {
  if (scheme !== "system") return scheme;
  return window.matchMedia(darkQuery).matches ? "dark" : "light";
}

export function useColorScheme(): {
  scheme: ColorScheme;
  resolved: "light" | "dark";
  setScheme: (scheme: ColorScheme) => void;
} {
  const [scheme, setSchemeState] = useState<ColorScheme>(() => readStored());
  const [resolved, setResolved] = useState<"light" | "dark">(() => resolve(readStored()));

  useEffect(() => {
    const apply = () => {
      const next = resolve(scheme);
      setResolved(next);
      document.documentElement.classList.toggle("dark", next === "dark");
      document.documentElement.style.colorScheme = next;
    };
    apply();
    const media = window.matchMedia(darkQuery);
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
    };
  }, [scheme]);

  const setScheme = useCallback((next: ColorScheme) => {
    window.localStorage.setItem(storageKey, next);
    setSchemeState(next);
  }, []);

  return { scheme, resolved, setScheme };
}
