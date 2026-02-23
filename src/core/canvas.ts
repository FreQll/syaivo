/**
 * Creates and manages a full-bleed canvas inside a container.
 * Handles DPR scaling and ResizeObserver-based resizing.
 */
export interface CanvasHandle {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  destroy(): void;
}

export function createCanvas(
  container: HTMLElement,
  onResize: (width: number, height: number) => void
): CanvasHandle {
  const canvas = document.createElement("canvas");

  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    display: "block",
    pointerEvents: "none",
  });

  // Ensure the container can act as a positioning parent
  const currentPosition = getComputedStyle(container).position;
  if (currentPosition === "static") {
    container.style.position = "relative";
  }

  container.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;
  let width = 0;
  let height = 0;

  function applySize(w: number, h: number): void {
    const dpr = window.devicePixelRatio || 1;
    width = w;
    height = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Initial size
  applySize(container.offsetWidth, container.offsetHeight);

  const ro = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const { inlineSize: w, blockSize: h } = entry.contentBoxSize[0] ?? {
      inlineSize: entry.contentRect.width,
      blockSize: entry.contentRect.height,
    };
    if (w !== width || h !== height) {
      applySize(w, h);
      onResize(w, h);
    }
  });

  ro.observe(container);

  return {
    canvas,
    ctx,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    destroy() {
      ro.disconnect();
      canvas.remove();
    },
  };
}
