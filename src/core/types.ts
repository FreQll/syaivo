/**
 * Base interface every effect must implement.
 * The core engine never depends on any framework.
 */
export interface BackgroundEffect {
  /** Mount the effect into a DOM container. */
  mount(container: HTMLElement): void;
  /** Tear down the effect and release all resources. */
  destroy(): void;
  /** Called automatically by ResizeObserver; can also be called manually. */
  resize(width: number, height: number): void;
  /** Pause the animation loop without destroying state. */
  pause(): void;
  /** Resume a paused animation loop. */
  resume(): void;
}

/** Shared canvas context passed to every render tick. */
export interface RenderContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Elapsed milliseconds since the previous frame. Clamped to 100ms max. */
  deltaTime: number;
  /** Total elapsed milliseconds since the effect was mounted. */
  elapsed: number;
}
