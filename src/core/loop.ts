/**
 * requestAnimationFrame loop with deltaTime and pause/resume support.
 * Never leaks RAF handles — stopping is guaranteed.
 */
export interface AnimationLoop {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

export function createLoop(
  tick: (deltaTime: number, elapsed: number) => void
): AnimationLoop {
  let rafId = 0;
  let lastTime = 0;
  let totalElapsed = 0;
  let active = false;

  function frame(now: number): void {
    if (!active) return;

    const raw = lastTime === 0 ? 0 : now - lastTime;
    // Clamp delta to avoid huge jumps after tab focus
    const deltaTime = Math.min(raw, 100);
    lastTime = now;
    totalElapsed += deltaTime;

    tick(deltaTime, totalElapsed);

    rafId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (active) return;
      active = true;
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      active = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    get running() {
      return active;
    },
  };
}
