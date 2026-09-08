import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "bingoji-pixel-mode";

type PixelModeContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

const PixelModeContext = createContext<PixelModeContextValue>({
  enabled: false,
  setEnabled: () => undefined,
});

function loadPixelMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function PixelModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(loadPixelMode);
  const setEnabled = useCallback((nextEnabled: boolean) => {
    setEnabledState(nextEnabled);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(nextEnabled));
    } catch {
      // Storage가 차단된 환경에서도 현재 페이지에서는 설정을 유지한다.
    }
  }, []);
  const value = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);

  return <PixelModeContext.Provider value={value}>{children}</PixelModeContext.Provider>;
}

export function usePixelMode(): PixelModeContextValue {
  return useContext(PixelModeContext);
}
