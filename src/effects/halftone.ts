import { createCanvas } from "../core/canvas.js";
import { createLoop } from "../core/loop.js";
import { simplex3 } from "../core/noise.js";
import { prefersReducedMotion, onReducedMotionChange } from "../core/reducedMotion.js";
import type { BackgroundEffect } from "../core/types.js";

export interface HalftoneOptions {
  /** Dot fill color (used if `colors` is not provided). Default: "#a5f3fc" */
  dotColor?: string;
  /** Optional dot color palette. When provided, dot colors interpolate across the palette using the shade value. */
  colors?: string[];
  /** Canvas background color. Default: "#0a0a0a" */
  backgroundColor?: string;

  /** Dot cell size in px (bigger = fewer/bigger dots). Default: 9 */
  pixelSize?: number;

  /** Minimum dot radius as a fraction of cell size. Default: 0.06 */
  dotMin?: number;
  /** Maximum dot radius as a fraction of cell size. Default: 0.48 */
  dotMax?: number;
  /** Skip dots below this normalized shade (cleans noisy background). Default: 0.14 */
  dotThreshold?: number;

  /** Gamma/contrast for shade -> dot radius. Default: 1.6 */
  contrast?: number;
  /** Invert shade mapping (useful for choosing where dots get larger). Default: false */
  invert?: boolean;

  /** Halftone gradient angle in degrees. Default: 135 */
  angle?: number;

  /** Amount of animated noise distortion for the shade field. Default: 0.35 */
  noiseIntensity?: number;

  /** Global dot opacity. Default: 0.9 */
  opacity?: number;

  /** Enable animation. Default: true */
  animated?: boolean;
  /** Respect prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;

  /**
   * Animation speed multiplier. Default: 0.45
   * (maps to time used by the noise field)
   */
  speed?: number;

  /** Number of flowing wave bands. Default: 2.8 */
  waveFrequency?: number;
  /** Vertical displacement amount for the ribbon centerline (0-1). Default: 0.12 */
  waveAmplitude?: number;
  /** Speed of the ribbon phase motion. Default: 0.85 */
  waveSpeed?: number;
  /** Ribbon thickness as a fraction of canvas height. Default: 0.14 */
  ribbonWidth?: number;
  /** Ribbon falloff sharpness (>1 sharper edge). Default: 2.2 */
  ribbonSoftness?: number;
}

const DEFAULTS: Required<HalftoneOptions> = {
  dotColor: "#a5f3fc",
  colors: [],
  backgroundColor: "#0a0a0a",
  pixelSize: 9,
  dotMin: 0.06,
  dotMax: 0.48,
  dotThreshold: 0.14,
  contrast: 1.6,
  invert: false,
  angle: 135,
  noiseIntensity: 0.35,
  opacity: 0.9,
  animated: true,
  respectReducedMotion: true,
  speed: 0.8,
  waveFrequency: 2.8,
  waveAmplitude: 0.12,
  waveSpeed: 1.1,
  ribbonWidth: 0.14,
  ribbonSoftness: 2.2,
};

interface RGB {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): RGB {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
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
  return { r: 255, g: 255, b: 255 };
}

function parseColor(str: string): RGB {
  return str.startsWith("#") ? parseHex(str) : parseRgba(str);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function rgbToFillStyle(c: RGB, alpha: number): string {
  // Keep this local to avoid dragging string formatting throughout the hot loop.
  return `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${alpha})`;
}

export interface HalftoneEffect extends BackgroundEffect {
  update(options: Partial<HalftoneOptions>): void;
}

export function createHalftone(options: HalftoneOptions = {}): HalftoneEffect {
  let opts = { ...DEFAULTS, ...options };

  let canvasHandle: ReturnType<typeof createCanvas> | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let cleanupMotion: (() => void) | null = null;

  let parsedDot: RGB = parseColor(opts.dotColor);
  let parsedPalette: RGB[] = opts.colors.length ? opts.colors.map(parseColor) : [];
  let time = 0;
  let coarseField: Float32Array | null = null;

  function isMotionDisabled(): boolean {
    return opts.respectReducedMotion && prefersReducedMotion();
  }

  function rebuildPalette(): void {
    parsedDot = parseColor(opts.dotColor);
    parsedPalette = opts.colors.length ? opts.colors.map(parseColor) : [];
  }

  function getPaletteColor(shade01: number): RGB {
    if (parsedPalette.length <= 1) return parsedDot;
    const nStops = parsedPalette.length - 1;
    const scaled = shade01 * nStops;
    const idx = Math.min(Math.floor(scaled), nStops - 1);
    const frac = scaled - idx;
    return mixRgb(parsedPalette[idx], parsedPalette[idx + 1], frac);
  }

  function drawFrame(): void {
    if (!canvasHandle) return;
    const { ctx, width, height } = canvasHandle;

    const ps = Math.max(3, Math.round(opts.pixelSize));
    const cols = Math.max(2, Math.ceil(width / ps) + 2);
    const rows = Math.max(2, Math.ceil(height / ps) + 2);

    const rad = (opts.angle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const TAU = Math.PI * 2;

    // Normalize gradient using projections of canvas corners.
    const projections = [0, dx * width, dy * height, dx * width + dy * height];
    const minP = Math.min(...projections);
    const maxP = Math.max(...projections);
    const range = maxP - minP || 1;

    const alpha = clamp01(opts.opacity);
    const usePalette = parsedPalette.length > 1;
    const singleFill = rgbToFillStyle(parsedDot, alpha);
    const STEP = 4;

    ctx.clearRect(0, 0, width, height);
    if (opts.backgroundColor !== "transparent") {
      ctx.fillStyle = opts.backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    // Build a coarse deformation/intensity field, then bilinear-upsample per dot.
    const cCols = Math.ceil(cols / STEP) + 1;
    const cRows = Math.ceil(rows / STEP) + 1;
    const cSize = cCols * cRows;
    if (!coarseField || coarseField.length < cSize) {
      coarseField = new Float32Array(cSize);
    }

    // Boost temporal phase so animation remains visible at background-safe speeds.
    const phase = time * opts.waveSpeed * 1.8;
    const amp = opts.waveAmplitude;

    for (let cr = 0; cr < cRows; cr++) {
      const row = cr * STEP;
      const y = row * ps;
      const ny = height > 0 ? y / height : 0;
      const rowOff = cr * cCols;

      for (let cc = 0; cc < cCols; cc++) {
        const col = cc * STEP;
        const x = col * ps;
        const nx = width > 0 ? x / width : 0;

        // Domain warp (low-frequency + detail) for non-repeating organic deformation.
        const flowX = phase * 0.03;
        const flowY = phase * 0.022;
        const warpX =
          simplex3(nx * 1.35 + flowX, ny * 1.2 - flowY, phase * 0.11) * (amp * 0.7) +
          simplex3(nx * 4.6 + 1.7 + flowX * 0.6, ny * 4.2 - 2.2 + flowY * 0.5, phase * 0.18) * (amp * 0.2);
        const warpY =
          simplex3(nx * 1.15 - 3.1 - flowX * 0.5, ny * 1.55 + 0.8 + flowY * 0.7, phase * 0.12) * (amp * 0.75) +
          simplex3(nx * 5.2 - 1.9 + flowX * 0.7, ny * 5.5 + 2.1 - flowY * 0.4, phase * 0.2) * (amp * 0.18);
        const wx = nx + warpX;
        const wy = ny + warpY;

        // Asymmetric flowing shape (not a clean sine wave).
        const centerline =
          0.52 +
          simplex3(wx * (opts.waveFrequency * 0.95), 0.33, phase * 0.065) * (amp * 1.25) +
          Math.sin(wx * TAU * (opts.waveFrequency * 0.4) + phase * 0.55) * (amp * 0.4);

        const localWidth =
          Math.max(0.02, opts.ribbonWidth) *
          (0.82 + 0.45 * (0.5 + 0.5 * simplex3(wx * 2.2, 1.75, phase * 0.075)));

        const d = Math.abs(wy - centerline) / localWidth;
        const feather =
          d +
          simplex3(wx * 6.1, wy * 5.6, phase * 0.19) * 0.16 +
          simplex3(wx * 11.8 + 2.8, wy * 12.1 - 2.5, phase * 0.25) * 0.07;
        const band = Math.exp(-Math.pow(Math.max(0, feather), opts.ribbonSoftness));

        const proj = dx * x + dy * y;
        const angled = (proj - minP) / range;
        const turbulence =
          0.62 +
          simplex3(wx * 2.8, wy * 2.35, phase * 0.11) * 0.25 +
          simplex3(wx * 7.2, wy * 7.6, phase * 0.18) * 0.13;

        const fold =
          0.5 +
          0.5 *
            simplex3(
              wx * (opts.waveFrequency * 1.3),
              wy * (opts.waveFrequency * 0.8),
              phase * 0.085
            );
        const depth = smoothstep(0.38, 0.62, fold) * 0.2;

        let val = clamp01(band * (0.66 * turbulence + 0.2 * angled + depth));
        val = clamp01(
          val +
            simplex3(col * 0.09, row * 0.09, time * 0.06) * opts.noiseIntensity * 0.22
        );
        coarseField[rowOff + cc] = val;
      }
    }

    // Draw true circles on a square lattice (never hex packed).
    if (!usePalette) ctx.fillStyle = singleFill;

    for (let row = 0; row < rows; row++) {
      const cy = row * ps;
      const cr = (row / STEP) | 0;
      const fy = row / STEP - cr;
      const cr0 = cr * cCols;
      const cr1 = Math.min(cr + 1, cRows - 1) * cCols;

      for (let col = 0; col < cols; col++) {
        const cx = col * ps;
        const cc = (col / STEP) | 0;
        const fx = col / STEP - cc;
        const cc1 = Math.min(cc + 1, cCols - 1);
        const top = coarseField[cr0 + cc] + (coarseField[cr0 + cc1] - coarseField[cr0 + cc]) * fx;
        const bot = coarseField[cr1 + cc] + (coarseField[cr1 + cc1] - coarseField[cr1 + cc]) * fx;
        const t = top + (bot - top) * fy;

        // Shade -> dot radius mapping
        const shade = opts.invert ? 1 - t : t;
        const shaped = Math.pow(clamp01(shade), opts.contrast);
        if (shaped < opts.dotThreshold) continue;
        const rNorm = opts.dotMin + (opts.dotMax - opts.dotMin) * shaped;
        const r = rNorm * ps;

        if (r <= 0.01) continue;

        if (usePalette) {
          const colorRgb = getPaletteColor(shaped);
          ctx.fillStyle = rgbToFillStyle(colorRgb, alpha);
        }
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function tick(deltaTime: number): void {
    time += (deltaTime / 1000) * opts.speed;
    drawFrame();
  }

  return {
    mount(container: HTMLElement) {
      rebuildPalette();
      canvasHandle = createCanvas(container, () => {
        drawFrame();
      });

      const animated = opts.animated && !isMotionDisabled();
      if (animated) {
        loop = createLoop((deltaTime) => tick(deltaTime));
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
      coarseField = null;
    },

    resize(_w: number, _h: number) {
      drawFrame();
    },

    pause() {
      loop?.stop();
    },

    resume() {
      if (opts.animated && !isMotionDisabled()) loop?.start();
    },

    update(newOptions: Partial<HalftoneOptions>) {
      const prevColors = opts.colors;
      const prevDotColor = opts.dotColor;
      opts = { ...opts, ...newOptions };

      if (
        newOptions.dotColor !== undefined ||
        newOptions.colors !== undefined ||
        prevDotColor !== opts.dotColor ||
        prevColors !== opts.colors
      ) {
        rebuildPalette();
      }

      // Always re-render: animation/toggles affect the visuals immediately.
      drawFrame();
    },
  };
}

