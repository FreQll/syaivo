import { createCanvas } from "../core/canvas.js";
import { createLoop } from "../core/loop.js";
import { simplex3 } from "../core/noise.js";
import { prefersReducedMotion, onReducedMotionChange } from "../core/reducedMotion.js";
import type { BackgroundEffect } from "../core/types.js";

export interface DitherOptions {
  /** Gradient color stops. Default: purple → blue → teal. */
  colors?: string[];
  /** Canvas background. Default: "#0a0a0a" */
  backgroundColor?: string;
  /** Size of each dither block in px. Default: 4 */
  pixelSize?: number;
  /** Dithering pattern. Default: "bayer" */
  pattern?: "bayer" | "dots";
  /** Gradient angle in degrees (0 = left→right, 90 = top→bottom). Default: 135 */
  angle?: number;
  /** Amount of noise distortion added to the gradient (0–1). Default: 0.3 */
  noiseIntensity?: number;
  /** Animation speed multiplier. Default: 1 */
  speed?: number;
  /** Enable animation. Default: true */
  animated?: boolean;
  /** Respect prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;
}

const DEFAULTS: Required<DitherOptions> = {
  colors: [
    "#c084fc", // purple
    "#818cf8", // indigo
    "#38bdf8", // sky
    "#2dd4bf", // teal
  ],
  backgroundColor: "#0a0a0a",
  pixelSize: 4,
  pattern: "bayer",
  angle: 135,
  noiseIntensity: 0.3,
  speed: 1,
  animated: true,
  respectReducedMotion: true,
};

// ── 8×8 Bayer matrix (normalized to 0–1) ──────────────────────────────────

const BAYER_8: number[][] = (() => {
  const raw = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ];
  return raw.map(row => row.map(v => v / 64));
})();

// ── Dot pattern threshold (radial per-cell) ───────────────────────────────

function dotThreshold(x: number, y: number): number {
  const cx = (x % 8) - 3.5;
  const cy = (y % 8) - 3.5;
  return Math.sqrt(cx * cx + cy * cy) / 4.95; // 0–1
}

// ── Color helpers ─────────────────────────────────────────────────────────

interface RGB { r: number; g: number; b: number }

function parseHex(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3
    ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
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

// ── Effect ────────────────────────────────────────────────────────────────

export interface DitherEffect extends BackgroundEffect {
  update(options: Partial<DitherOptions>): void;
}

export function createDither(options: DitherOptions = {}): DitherEffect {
  let opts = { ...DEFAULTS, ...options };

  let canvasHandle: ReturnType<typeof createCanvas> | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let cleanupMotion: (() => void) | null = null;
  let parsedColors: RGB[] = [];
  let parsedBg: RGB = { r: 10, g: 10, b: 10 };
  let time = 0;

  function rebuildColors(): void {
    parsedColors = opts.colors.map(parseColor);
    parsedBg = parseColor(opts.backgroundColor);
  }

  function isMotionDisabled(): boolean {
    return opts.respectReducedMotion && prefersReducedMotion();
  }

  function getThreshold(gx: number, gy: number): number {
    if (opts.pattern === "dots") return dotThreshold(gx, gy);
    return BAYER_8[gy & 7][gx & 7];
  }

  function drawFrame(): void {
    if (!canvasHandle) return;
    const { ctx, canvas, width, height } = canvasHandle;

    const ps = opts.pixelSize;
    const cols = Math.ceil(width / ps);
    const rows = Math.ceil(height / ps);

    // Gradient direction
    const rad = (opts.angle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    // Project corners to find min/max for normalization
    const projections = [
      0, dx * width, dy * height, dx * width + dy * height,
    ];
    const minP = Math.min(...projections);
    const maxP = Math.max(...projections);
    const range = maxP - minP || 1;

    const nColors = parsedColors.length;
    const nStops = nColors - 1;

    // Work directly with ImageData for performance
    const imgData = ctx.createImageData(canvas.width, canvas.height);
    const data = imgData.data;
    const dpr = window.devicePixelRatio || 1;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Center of this dither block in canvas coords
        const cx = (col + 0.5) * ps;
        const cy = (row + 0.5) * ps;

        // Base gradient value (0–1) along the angle
        const proj = dx * cx + dy * cy;
        let t = (proj - minP) / range;

        // Add animated noise distortion
        const noise = simplex3(
          col * 0.08,
          row * 0.08,
          time * 0.06,
        );
        t += noise * opts.noiseIntensity;
        t = Math.max(0, Math.min(1, t));

        // Map t to color pair + local fraction
        const scaled = t * nStops;
        const idx = Math.min(Math.floor(scaled), nStops - 1);
        const frac = scaled - idx;

        const c0 = parsedColors[idx];
        const c1 = parsedColors[idx + 1];

        // Dither: compare fraction against threshold
        const threshold = getThreshold(col, row);
        const pick = frac > threshold ? c1 : c0;

        const r = pick.r;
        const g = pick.g;
        const b = pick.b;

        // Fill the block in ImageData (accounting for DPR)
        const pxStart = Math.round(col * ps * dpr);
        const pyStart = Math.round(row * ps * dpr);
        const pxEnd = Math.min(Math.round((col + 1) * ps * dpr), canvas.width);
        const pyEnd = Math.min(Math.round((row + 1) * ps * dpr), canvas.height);
        const canvasW = canvas.width;

        for (let py = pyStart; py < pyEnd; py++) {
          for (let px = pxStart; px < pxEnd; px++) {
            const i = (py * canvasW + px) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  return {
    mount(container: HTMLElement) {
      rebuildColors();

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

    update(newOptions: Partial<DitherOptions>) {
      opts = { ...opts, ...newOptions };
      if (newOptions.colors !== undefined || newOptions.backgroundColor !== undefined) {
        rebuildColors();
      }
      drawFrame();
    },
  };
}
