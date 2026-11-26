/**
 * Calls `fn` once the main thread is idle (hydration done, first paint out), at the latest after
 * `timeout` ms. Returns a cancel function. Safari has no requestIdleCallback: a short timeout.
 */
export function whenIdle(fn: () => void, timeout = 1500) {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(fn, { timeout });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 250);
  return () => clearTimeout(id);
}
