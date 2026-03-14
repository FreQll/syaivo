import { createCanvas } from "../core/canvas.js";
import { createLoop } from "../core/loop.js";
import { simplex3 } from "../core/noise.js";
import { prefersReducedMotion, onReducedMotionChange } from "../core/reducedMotion.js";
import type { BackgroundEffect } from "../core/types.js";

export interface MeshGradientOptions {
  /** Colors for the mesh control points. Default: Apple-style vibrant palette. */
  colors?: string[];
  /** Canvas background. Default: "#0a0a0a" */
  backgroundColor?: string;
  /** Number of control points. Default: 6 */
  points?: number;
  /** How far points drift from their base position (0–1). Default: 0.4 */
  distortion?: number;
  /** Animation speed multiplier. Default: 0.2 */
  speed?: number;
  /** Enable animation. Default: true */
  animated?: boolean;
  /** Respect prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;
}

const DEFAULTS: Required<MeshGradientOptions> = {
  colors: [
    "#c084fc", // purple
    "#818cf8", // indigo
    "#38bdf8", // sky
    "#34d399", // emerald
    "#fb923c", // orange
    "#f472b6", // pink
  ],
  backgroundColor: "#0a0a0a",
  points: 6,
  distortion: 0.4,
  speed: 0.2,
  animated: true,
  respectReducedMotion: true,
};

// ── Color helpers ──────────────────────────────────────────────────────────

interface RGB { r: number; g: number; b: number }

function parseHex(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3
    ? h[0]+h[0]+h[1]+h[1]+h[2]+h[2]
    : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function parseRgba(str: string): RGB {
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return { r: 128, g: 128, b: 128 };
}

function parseColor(str: string): RGB {
  return str.startsWith("#") ? parseHex(str) : parseRgba(str);
}

// ── Control point ──────────────────────────────────────────────────────────

interface ControlPoint {
  /** Base position (0–1). */
  bx: number;
  by: number;
  /** Current position in offscreen px. */
  x: number;
  y: number;
  /** Noise seeds. */
  seedX: number;
  seedY: number;
  color: RGB;
}

/** Render at low resolution, upscale for natural softness. */
const DOWNSAMPLE = 8;

export interface MeshGradientEffect extends BackgroundEffect {
  update(options: Partial<MeshGradientOptions>): void;
}

export function createMeshGradient(options: MeshGradientOptions = {}): MeshGradientEffect {
  let opts = { ...DEFAULTS, ...options };

  let canvasHandle: ReturnType<typeof createCanvas> | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let cleanupMotion: (() => void) | null = null;
  let points: ControlPoint[] = [];
  let parsedColors: RGB[] = [];
  let time = 0;

  // Offscreen canvas for low-res rendering
  let offscreen: HTMLCanvasElement | null = null;
  let offCtx: CanvasRenderingContext2D | null = null;
  let imgData: ImageData | null = null;

  function buildPoints(count: number): ControlPoint[] {
    parsedColors = opts.colors.map(parseColor);
    return Array.from({ length: count }, (_, i) => ({
      bx: 0.15 + ((i % 3) / 2) * 0.7 + (Math.sin(i * 2.3) * 0.1),
      by: 0.15 + (Math.floor(i / 3) / Math.max(Math.ceil(count / 3) - 1, 1)) * 0.7 + (Math.cos(i * 1.7) * 0.1),
      x: 0,
      y: 0,
      seedX: i * 73.1 + 11.3,
      seedY: i * 137.9 + 47.7,
      color: parsedColors[i % parsedColors.length],
    }));
  }

  function isMotionDisabled(): boolean {
    return opts.respectReducedMotion && prefersReducedMotion();
  }

  function ensureOffscreen(w: number, h: number): void {
    const ow = Math.ceil(w / DOWNSAMPLE);
    const oh = Math.ceil(h / DOWNSAMPLE);
    if (!offscreen || offscreen.width !== ow || offscreen.height !== oh) {
      offscreen = document.createElement("canvas");
      offscreen.width = ow;
      offscreen.height = oh;
      offCtx = offscreen.getContext("2d")!;
      imgData = offCtx.createImageData(ow, oh);
    }
  }

  function updatePoints(ow: number, oh: number): void {
    const dist = opts.distortion;
    for (const p of points) {
      const nx = simplex3(p.seedX, 0, time * 0.15) * dist;
      const ny = simplex3(0, p.seedY, time * 0.12) * dist;
      p.x = (p.bx + nx) * ow;
      p.y = (p.by + ny) * oh;
    }
  }

  function drawFrame(): void {
    if (!canvasHandle) return;
    const { ctx, width, height } = canvasHandle;

    const ow = Math.ceil(width / DOWNSAMPLE);
    const oh = Math.ceil(height / DOWNSAMPLE);
    ensureOffscreen(width, height);
    if (!offCtx || !imgData) return;

    updatePoints(ow, oh);

    // Per-pixel inverse-distance weighted color interpolation
    const data = imgData.data;
    const n = points.length;

    // Precompute per-point inverse max distance for falloff
    const maxDist = Math.sqrt(ow * ow + oh * oh);

    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        let totalWeight = 0;
        let r = 0, g = 0, b = 0;

        for (let i = 0; i < n; i++) {
          const p = points[i];
          const dx = x - p.x;
          const dy = y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Smooth inverse-distance weight with power 3 for tighter blobs
          const w = 1 / (1 + Math.pow(dist / (maxDist * 0.25), 3));
          r += p.color.r * w;
          g += p.color.g * w;
          b += p.color.b * w;
          totalWeight += w;
        }

        const idx = (y * ow + x) * 4;
        data[idx]     = r / totalWeight;
        data[idx + 1] = g / totalWeight;
        data[idx + 2] = b / totalWeight;
        data[idx + 3] = 255;
      }
    }

    offCtx.putImageData(imgData, 0, 0);

    // Draw background then upscale mesh onto main canvas
    ctx.clearRect(0, 0, width, height);
    if (opts.backgroundColor !== "transparent") {
      ctx.fillStyle = opts.backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(offscreen!, 0, 0, ow, oh, 0, 0, width, height);
  }

  return {
    mount(container: HTMLElement) {
      points = buildPoints(opts.points);

      canvasHandle = createCanvas(container, () => {
        drawFrame();
      });

      const animated = opts.animated && !isMotionDisabled();

      if (animated) {
        loop = createLoop((deltaTime) => {
          time += (deltaTime / 1000) * opts.speed;
          drawFrame();
        });
        loop.start();
      } else {
        drawFrame();
      }

      if (opts.respectReducedMotion) {
        cleanupMotion = onReducedMotionChange((reduced) => {
          if (reduced) {
            loop?.stop();
            drawFrame();
          } else if (opts.animated) {
            loop?.start();
          }
        });
      }
    },

    destroy() {
      loop?.stop();
      canvasHandle?.destroy();
      cleanupMotion?.();
      loop = null;
      canvasHandle = null;
      cleanupMotion = null;
      offscreen = null;
      offCtx = null;
      imgData = null;
    },

    resize(_w: number, _h: number) {
      drawFrame();
    },

    pause() {
      loop?.stop();
    },

    resume() {
      if (opts.animated && !isMotionDisabled()) {
        loop?.start();
      }
    },

    update(newOptions: Partial<MeshGradientOptions>) {
      const prevPoints = opts.points;
      opts = { ...opts, ...newOptions };
      if (
        newOptions.points !== undefined && newOptions.points !== prevPoints ||
        newOptions.colors !== undefined
      ) {
        points = buildPoints(opts.points);
      }
      drawFrame();
    },
  };
}
