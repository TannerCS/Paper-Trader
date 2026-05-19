import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { defaultThemeName, type ThemeName } from "./themes";

interface ThemeContextValue {
  themeName: ThemeName;
  setThemeName: (themeName: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const themeStorageKey = "paper-trader.theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeNameState] = useState<ThemeName>(() => {
    const storedThemeName = globalThis.localStorage?.getItem(themeStorageKey);
    return storedThemeName === "cupertino-dark" || storedThemeName === "cupertino-light"
      ? storedThemeName
      : defaultThemeName;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = themeName;
    globalThis.localStorage?.setItem(themeStorageKey, themeName);
  }, [themeName]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeName,
      setThemeName: setThemeNameState,
    }),
    [themeName],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const themeContext = useContext(ThemeContext);

  if (!themeContext) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return themeContext;
}
