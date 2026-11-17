"use client";

import { useCallback, useSyncExternalStore } from "react";

/** SSR-safe matchMedia subscription. Returns `serverValue` during SSR/hydration. */
export function useMediaQuery(query: string, serverValue = false) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const usePrefersReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");
export const useCanHover = () => useMediaQuery("(hover: hover) and (pointer: fine)");

const noopSubscribe = () => () => {};
/** true only after hydration, without a setState-in-effect. */
export function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
