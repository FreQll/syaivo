import { createCanvas } from "../core/canvas.js";
import { createLoop } from "../core/loop.js";
import { simplex2 } from "../core/noise.js";
import { prefersReducedMotion, onReducedMotionChange } from "../core/reducedMotion.js";
import type { BackgroundEffect } from "../core/types.js";

export type DitherWarpShape =
  | "simplex"
  | "warp"
  | "dots"
  | "wave"
  | "ripple"
  | "swirl"
  | "sphere";

export type DitherWarpPattern = "random" | "2x2" | "4x4" | "8x8";

export interface DitherWarpOptions {
  /** Front (foreground) color. Default: "#00b2ff" */
  colorFront?: string;
  /** Back (background) color. Default: "#000000" */
  colorBack?: string;
  /** Shape mode. Default: "warp" */
  shape?: DitherWarpShape;
  /** Dithering pattern. Default: "4x4" */
  pattern?: DitherWarpPattern;
  /** Pixel block size in px. Default: 3 */
  pixelSize?: number;
  /** Scale of the shape (higher = zoomed in). Default: 1 */
  scale?: number;
  /** Animation speed multiplier. Default: 1 */
  speed?: number;
  /** Enable animation. Default: true */
  animated?: boolean;
  /** Respect prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;
}

const DEFAULTS: Required<DitherWarpOptions> = {
  colorFront: "#00b2ff",
  colorBack: "#000000",
  shape: "warp",
  pattern: "4x4",
  pixelSize: 3,
  scale: 1,
  speed: 1,
  animated: true,
  respectReducedMotion: true,
};

// ── Color ─────────────────────────────────────────────────────────────────

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
  return { r: 0, g: 0, b: 0 };
}

function parseColor(str: string): RGB {
  return str.startsWith("#") ? parseHex(str) : parseRgba(str);
}

// ── Bayer matrices ────────────────────────────────────────────────────────

const BAYER_2 = [0, 2, 3, 1];
const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BAYER_8 = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

function getBayerValue(col: number, row: number, size: number): number {
  const x = ((col % size) + size) % size;
  const y = ((row % size) + size) % size;
  const idx = y * size + x;
  if (size === 2) return BAYER_2[idx] / 4;
  if (size === 4) return BAYER_4[idx] / 16;
  return BAYER_8[idx] / 64;
}

// ── Hash (matches shader's hash21/hash11) ─────────────────────────────────

function hash21(x: number, y: number): number {
  let px = (x * 0.3183099 + 0.1) % 1; if (px < 0) px += 1;
  let py = (y * 0.3678794 + 0.1) % 1; if (py < 0) py += 1;
  const s = px + py + (px + py) * 19.19;
  px += s; py += s;
  return ((px * py) % 1 + 1) % 1;
}

function hash11(p: number): number {
  let v = ((p * 0.3183099) % 1 + 1) % 1 + 0.1;
  v *= v + 19.19;
  return ((v * v) % 1 + 1) % 1;
}

// ── Simplex noise for the shader (layered) ────────────────────────────────

function getSimplexNoise(x: number, y: number, t: number): number {
  const n1 = 0.5 * simplex2(x, y - 0.3 * t);
  const n2 = 0.5 * simplex2(2 * x, 2 * y + 0.32 * t);
  return n1 + n2;
}

// ── Smoothstep ────────────────────────────────────────────────────────────

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function fract(x: number): number {
  return x - Math.floor(x);
}

// ── Shape functions (ported from shader) ──────────────────────────────────

function computeShape(
  shape: DitherWarpShape,
  rawX: number, rawY: number,
  t: number, scale: number,
): number {
  let sx: number, sy: number;

  switch (shape) {
    case "simplex": {
      sx = rawX * 0.001 / scale;
      sy = rawY * 0.001 / scale;
      let s = 0.5 + 0.5 * getSimplexNoise(sx, sy, t);
      return smoothstep(0.3, 0.9, s);
    }

    case "warp": {
      sx = rawX * 0.003 / scale;
      sy = rawY * 0.003 / scale;
      for (let i = 1; i < 6; i++) {
        sx += (0.6 / i) * Math.cos(i * 2.5 * sy + t);
        sy += (0.6 / i) * Math.cos(i * 1.5 * sx + t);
      }
      let w = 0.15 / Math.max(0.001, Math.abs(Math.sin(t - sy - sx)));
      return smoothstep(0.02, 1, w);
    }

    case "dots": {
      sx = rawX * 0.05 / scale;
      sy = rawY * 0.05 / scale;
      const TWO_PI = Math.PI * 2;
      const stripeIdx = Math.floor(2 * sx / TWO_PI);
      let rand = hash11(stripeIdx * 10);
      rand = Math.sign(rand - 0.5) * Math.pow(0.1 + Math.abs(rand), 0.4);
      let d = Math.sin(sx) * Math.cos(sy - 5 * rand * t);
      return Math.pow(Math.abs(d), 6);
    }

    case "wave": {
      sx = rawX * 4 / scale;
      sy = rawY * 4 / scale;
      const wave = Math.cos(0.5 * sx - 2 * t) * Math.sin(1.5 * sx + t) * (0.75 + 0.25 * Math.cos(3 * t));
      return 1 - smoothstep(-1, 1, sy + wave);
    }

    case "ripple": {
      sx = rawX / scale;
      sy = rawY / scale;
      const dist = Math.sqrt(sx * sx + sy * sy);
      return Math.sin(Math.pow(dist, 1.7) * 7 - 3 * t) * 0.5 + 0.5;
    }

    case "swirl": {
      sx = rawX / scale;
      sy = rawY / scale;
      const l = Math.sqrt(sx * sx + sy * sy);
      const angle = 6 * Math.atan2(sy, sx) + 4 * t;
      const twist = 1.2;
      const offset = 1 / Math.pow(Math.max(l, 1e-6), twist) + angle / (Math.PI * 2);
      const mid = smoothstep(0, 1, Math.pow(l, twist));
      return fract(offset) * mid;
    }

    case "sphere": {
      sx = rawX * 2 / scale;
      sy = rawY * 2 / scale;
      const dd = 1 - (sx * sx + sy * sy);
      if (dd <= 0) return 0;
      const pz = Math.sqrt(dd);
      const lx = Math.cos(1.5 * t);
      const ly = 0.8;
      const lz = Math.sin(1.25 * t);
      const len = Math.sqrt(lx * lx + ly * ly + lz * lz);
      return 0.5 + 0.5 * (lx / len * sx + ly / len * sy + lz / len * pz);
    }
  }
}

// ── Effect ────────────────────────────────────────────────────────────────

export interface DitherWarpEffect extends BackgroundEffect {
  update(options: Partial<DitherWarpOptions>): void;
}

export function createDitherWarp(options: DitherWarpOptions = {}): DitherWarpEffect {
  let opts = { ...DEFAULTS, ...options };

  let canvasHandle: ReturnType<typeof createCanvas> | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let cleanupMotion: (() => void) | null = null;
  let fg: RGB = parseColor(opts.colorFront);
  let bg: RGB = parseColor(opts.colorBack);
  let time = 0;

  function rebuildColors(): void {
    fg = parseColor(opts.colorFront);
    bg = parseColor(opts.colorBack);
  }

  function isMotionDisabled(): boolean {
    return opts.respectReducedMotion && prefersReducedMotion();
  }

  function getDithering(col: number, row: number, shapeVal: number): number {
    switch (opts.pattern) {
      case "random":
        return hash21(col, row) < shapeVal ? 1 : 0;
      case "2x2":
        return (shapeVal + getBayerValue(col, row, 2) - 0.5) >= 0.5 ? 1 : 0;
      case "4x4":
        return (shapeVal + getBayerValue(col, row, 4) - 0.5) >= 0.5 ? 1 : 0;
      case "8x8":
        return (shapeVal + getBayerValue(col, row, 8) - 0.5) >= 0.5 ? 1 : 0;
    }
  }

  function drawFrame(): void {
    if (!canvasHandle) return;
    const { ctx, canvas, width, height } = canvasHandle;

    const ps = opts.pixelSize;
    const cols = Math.ceil(width / ps);
    const rows = Math.ceil(height / ps);
    const t = time * 0.5;
    const scale = opts.scale;

    const imgData = ctx.createImageData(canvas.width, canvas.height);
    const data = imgData.data;
    const dpr = window.devicePixelRatio || 1;

    // Normalized center for shapes that need it
    const cxN = width * 0.5;
    const cyN = height * 0.5;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Pixelated UV: snap to grid center
        const px = (col + 0.5) * ps;
        const py = (row + 0.5) * ps;

        // Normalized UV relative to center (for radial shapes)
        // For non-radial shapes, use raw pixel coords like the shader
        const nx = px - cxN;
        const ny = py - cyN;

        const shape = opts.shape;
        let shapeVal: number;

        // Radial shapes use normalized coords, pattern shapes use pixel coords
        if (shape === "ripple" || shape === "swirl" || shape === "sphere") {
          const aspect = width / height;
          shapeVal = computeShape(shape, nx / height, ny / height, t, scale);
        } else {
          shapeVal = computeShape(shape, px, py, t, scale);
        }

        const res = getDithering(col, row, shapeVal);
        const pick = res ? fg : bg;

        // Fill block
        const pxStart = Math.round(col * ps * dpr);
        const pyStart = Math.round(row * ps * dpr);
        const pxEnd = Math.min(Math.round((col + 1) * ps * dpr), canvas.width);
        const pyEnd = Math.min(Math.round((row + 1) * ps * dpr), canvas.height);
        const canvasW = canvas.width;

        for (let fy = pyStart; fy < pyEnd; fy++) {
          for (let fx = pxStart; fx < pxEnd; fx++) {
            const i = (fy * canvasW + fx) * 4;
            data[i] = pick.r;
            data[i + 1] = pick.g;
            data[i + 2] = pick.b;
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

    update(newOptions: Partial<DitherWarpOptions>) {
      opts = { ...opts, ...newOptions };
      if (newOptions.colorFront !== undefined || newOptions.colorBack !== undefined) {
        rebuildColors();
      }
      drawFrame();
    },
  };
}
