import { useEffect, useState } from "react";
import { SwitchMode } from "@/components/ui/switch-mode";

const STORAGE_KEY = "rs-theme";
const THEME_EVENT = "rs-theme-change";

type Theme = "light" | "dark";

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "dark";
  } catch {
    return "dark";
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function ThemeToggle({
  className,
  width = 56,
  height = 28,
}: {
  className?: string;
  width?: number;
  height?: number;
}) {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    const sync = () => {
      const current = getStoredTheme();
      setTheme(current);
      applyTheme(current);
    };

    sync();

    const onCustomEvent = (e: Event) => {
      const next = (e as CustomEvent<Theme>).detail;
      if (next === "light" || next === "dark") {
        setTheme(next);
        applyTheme(next);
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) sync();
    };

    window.addEventListener(THEME_EVENT, onCustomEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(THEME_EVENT, onCustomEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const handleToggle = (nextIsDark: boolean) => {
    const next: Theme = nextIsDark ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage quota/privacy mode errors
    }
    window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: next }));
  };

  return (
    <SwitchMode
      checked={theme === "dark"}
      onCheckedChange={handleToggle}
      width={width}
      height={height}
      darkColor="#111"
      lightColor="#F9F9F9"
      knobDarkColor="#1C1C1C"
      knobLightColor="#F3F3F7"
      borderDarkColor="#444"
      borderLightColor="#DDD"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={className}
    />
  );
}
