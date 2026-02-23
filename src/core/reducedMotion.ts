/**
 * Utility to detect and respect prefers-reduced-motion.
 */

let _mql: MediaQueryList | null = null;

function getMql(): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  if (!_mql) {
    _mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  }
  return _mql;
}

export function prefersReducedMotion(): boolean {
  return getMql()?.matches ?? false;
}

export function onReducedMotionChange(
  callback: (reduced: boolean) => void
): () => void {
  const mql = getMql();
  if (!mql) return () => {};

  const handler = (e: MediaQueryListEvent) => callback(e.matches);
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}
