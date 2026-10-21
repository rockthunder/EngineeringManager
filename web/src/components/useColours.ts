import { useEffect } from 'react';

/** Apply the colours configured in Settings (blue/green/amber/red/grey) as CSS variables. */
export function useColours(colours: Readonly<Record<string, string>> | undefined) {
  useEffect(() => {
    if (!colours) return;
    for (const [k, v] of Object.entries(colours)) document.documentElement.style.setProperty(`--c-${k}`, v);
  }, [colours]);
}
