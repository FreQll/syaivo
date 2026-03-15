import { createCanvas } from "../core/canvas.js";
import { createLoop } from "../core/loop.js";
import { prefersReducedMotion, onReducedMotionChange } from "../core/reducedMotion.js";
import type { BackgroundEffect } from "../core/types.js";

export interface CyberGridOptions {
  /** Grid line color. Default: "#ff80ff" */
  gridColor?: string;
  /** Background color. Default: "#001a33" */
  backgroundColor?: string;
  /** Intensity / brightness of the grid (0–1). Default: 1 */
  intensity?: number;
  /** Horizontal anchor offset (-1 to 1). Default: -0.5 */
  anchor?: number;
  /** Field of view / horizon position (-1 to 1). Default: 0.2 */
  fov?: number;
  /** Scroll speed multiplier. Default: 1 */
  speed?: number;
  /** Render grid on the bottom half only with a flat horizon. Default: false */
  floorMode?: boolean;
  /** Line thickness multiplier. Default: 1 */
  lineWidth?: number;
  /** Pixelated retro look. Default: false (full resolution). */
  pixelated?: boolean;
  /** Enable animation. Default: true */
  animated?: boolean;
  /** Respect prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;
}

const DEFAULTS: Required<CyberGridOptions> = {
  gridColor: "#ff80ff",
  backgroundColor: "#001a33",
  intensity: 1,
  anchor: -0.5,
  fov: 0.2,
  speed: 1,
  floorMode: false,
  lineWidth: 1,
  pixelated: false,
  animated: true,
  respectReducedMotion: true,
};

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
  return { r: 255, g: 128, b: 255 };
}

function parseColor(str: string): RGB {
  return str.startsWith("#") ? parseHex(str) : parseRgba(str);
}

// ── Shader math ───────────────────────────────────────────────────────────

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function fract(x: number): number {
  return x - Math.floor(x);
}

/** Render resolution divisor. 1 = full res, higher = more pixelated. */
const DS_HQ = 1;
const DS_RETRO = 3;

// ── Effect ────────────────────────────────────────────────────────────────

export interface CyberGridEffect extends BackgroundEffect {
  update(options: Partial<CyberGridOptions>): void;
}

export function createCyberGrid(options: CyberGridOptions = {}): CyberGridEffect {
  let opts = { ...DEFAULTS, ...options };

  let canvasHandle: ReturnType<typeof createCanvas> | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let cleanupMotion: (() => void) | null = null;
  let time = 0;

  let bg: RGB = parseColor(opts.backgroundColor);
  let gc: RGB = parseColor(opts.gridColor);

  // Offscreen canvas
  let offscreen: HTMLCanvasElement | null = null;
  let offCtx: CanvasRenderingContext2D | null = null;
  let imgData: ImageData | null = null;

  function rebuildColors(): void {
    bg = parseColor(opts.backgroundColor);
    gc = parseColor(opts.gridColor);
  }

  function isMotionDisabled(): boolean {
    return opts.respectReducedMotion && prefersReducedMotion();
  }

  function getDivisor(): number {
    return opts.pixelated ? DS_RETRO : DS_HQ;
  }

  function ensureOffscreen(w: number, h: number): void {
    const d = getDivisor();
    const ow = Math.ceil(w / d);
    const oh = Math.ceil(h / d);
    if (!offscreen || offscreen.width !== ow || offscreen.height !== oh) {
      offscreen = document.createElement("canvas");
      offscreen.width = ow;
      offscreen.height = oh;
      offCtx = offscreen.getContext("2d")!;
      imgData = offCtx.createImageData(ow, oh);
    }
  }

  function grid(uvX: number, uvY: number, batt: number): number {
    // Line thickness varies with depth, scaled by lineWidth
    const lw = opts.lineWidth;
    const sizeX = uvY * 0.01 * lw;
    const sizeY = uvY * uvY * 0.2 * 0.01 * lw;

    // Scroll Y
    const scrolledY = uvY + time * opts.speed * (batt + 0.05);

    // Repeating grid: fract → center at 0 → abs
    const gx = Math.abs(fract(uvX) - 0.5);
    const gy = Math.abs(fract(scrolledY) - 0.5);

    // Sharp lines
    let lx = smoothstep(sizeX, 0, gx);
    let ly = smoothstep(sizeY, 0, gy);

    // Glow (wider, dimmer lines)
    lx += smoothstep(sizeX * 5, 0, gx) * 0.4 * batt;
    ly += smoothstep(sizeY * 5, 0, gy) * 0.4 * batt;

    return Math.min(lx + ly, 3);
  }

  function drawFrame(): void {
    if (!canvasHandle) return;
    const { ctx, width, height } = canvasHandle;

    const d = getDivisor();
    const ow = Math.ceil(width / d);
    const oh = Math.ceil(height / d);
    ensureOffscreen(width, height);
    if (!offCtx || !imgData) return;

    const data = imgData.data;
    const batt = opts.intensity;
    const fov = opts.fov;
    const anchor = opts.anchor;

    // In floorMode, the grid only renders on the bottom half.
    // We remap UV so the horizon sits at the vertical midpoint.
    const floor = opts.floorMode;
    const startRow = floor ? Math.floor(oh * 0.5) : 0;

    // Fill background for top half in floorMode
    if (floor) {
      for (let py = 0; py < startRow; py++) {
        for (let px = 0; px < ow; px++) {
          const idx = (py * ow + px) * 4;
          data[idx]     = bg.r;
          data[idx + 1] = bg.g;
          data[idx + 2] = bg.b;
          data[idx + 3] = 255;
        }
      }
    }

    for (let py = startRow; py < oh; py++) {
      for (let px = 0; px < ow; px++) {
        let uvX = px / ow;
        let uvY: number;

        if (floor) {
          // Remap bottom half to 0–1, offset by 0.15 so the horizon
          // starts where lines are already thin and clean
          uvY = (py - startRow) / (oh - startRow);
          uvY = 3.0 / (uvY + 0.15);
        } else {
          uvY = py / oh;
          uvY = 3.0 / (Math.abs(uvY + fov) + 0.05);
        }
        uvX += anchor;
        uvX *= uvY;

        const gridVal = grid(uvX, uvY, batt);

        // Mix background and grid color
        const mix = Math.min(gridVal, 1);
        const r = bg.r + (gc.r - bg.r) * mix;
        const g = bg.g + (gc.g - bg.g) * mix;
        const b = bg.b + (gc.b - bg.b) * mix;

        const idx = (py * ow + px) * 4;
        data[idx]     = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    offCtx.putImageData(imgData, 0, 0);

    // Upscale to main canvas
    ctx.imageSmoothingEnabled = !opts.pixelated;
    if (!opts.pixelated) ctx.imageSmoothingQuality = "high";
    ctx.drawImage(offscreen!, 0, 0, ow, oh, 0, 0, width, height);
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
          time += deltaTime / 1000;
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

    update(newOptions: Partial<CyberGridOptions>) {
      opts = { ...opts, ...newOptions };
      if (newOptions.gridColor !== undefined || newOptions.backgroundColor !== undefined) {
        rebuildColors();
      }
      drawFrame();
    },
  };
}
