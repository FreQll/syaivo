import { createCanvas } from "../core/canvas.js";
import { createLoop } from "../core/loop.js";
import { simplex3 } from "../core/noise.js";
import { prefersReducedMotion, onReducedMotionChange } from "../core/reducedMotion.js";
import type { BackgroundEffect } from "../core/types.js";

export interface AuroraOptions {
  /** Curtain colors. Default: green, teal, blue, purple aurora tones. */
  colors?: string[];
  /** Canvas background. Default: "#0a0a0a" */
  backgroundColor?: string;
  /** Number of light curtains. Default: 5 */
  curtains?: number;
  /** Horizontal wave amplitude as fraction of canvas width. Default: 0.12 */
  waveAmplitude?: number;
  /** Curtain width as fraction of canvas width. Default: 0.35 */
  curtainWidth?: number;
  /** Animation speed multiplier. Default: 1 */
  speed?: number;
  /** Global opacity for the aurora layer. Default: 0.5 */
  opacity?: number;
  /** Add visible horizontal scanlines for a CRT/retro look. Default: false */
  scanlines?: boolean;
  /** Enable animation. Default: true */
  animated?: boolean;
  /** Respect prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;
}

const DEFAULTS: Required<AuroraOptions> = {
  colors: [
    "rgba(52,211,153,0.55)",   // green
    "rgba(45,212,191,0.45)",   // teal
    "rgba(59,130,246,0.45)",   // blue
    "rgba(139,92,246,0.40)",   // purple
    "rgba(16,185,129,0.35)",   // emerald
  ],
  backgroundColor: "#0a0a0a",
  curtains: 5,
  waveAmplitude: 0.12,
  curtainWidth: 0.35,
  speed: 1,
  opacity: 0.5,
  scanlines: false,
  animated: true,
  respectReducedMotion: true,
};

interface Curtain {
  seed: number;
  baseX: number;
  colorIdx: number;
  widthMult: number;
  freqMult: number;
  speedMult: number;
}

/** Render at lower resolution for natural softness, then upscale. */
const DOWNSAMPLE = 4;
/** Vertical segments — high for smooth, low for scanline look. */
const SEGMENTS_SMOOTH = 200;
const SEGMENTS_SCANLINE = 48;

export interface AuroraEffect extends BackgroundEffect {
  update(options: Partial<AuroraOptions>): void;
}

export function createAurora(options: AuroraOptions = {}): AuroraEffect {
  let opts = { ...DEFAULTS, ...options };

  let canvasHandle: ReturnType<typeof createCanvas> | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let cleanupMotion: (() => void) | null = null;
  let curtains: Curtain[] = [];
  let time = 0;

  // Offscreen canvas for soft rendering
  let offscreen: HTMLCanvasElement | null = null;
  let offCtx: CanvasRenderingContext2D | null = null;

  function buildCurtains(count: number): Curtain[] {
    return Array.from({ length: count }, (_, i) => ({
      seed: i * 97.3 + 13.7,
      baseX: 0.1 + (i / Math.max(count - 1, 1)) * 0.8,
      colorIdx: i % opts.colors.length,
      widthMult: 0.7 + (((i * 3 + 1) % 5) / 5) * 0.6,
      freqMult: 0.7 + (((i * 7 + 2) % 5) / 5) * 0.6,
      speedMult: 0.6 + (((i * 11 + 3) % 5) / 5) * 0.8,
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
    }
  }

  function drawFrame(): void {
    if (!canvasHandle) return;
    const { ctx, width, height } = canvasHandle;

    // Background on main canvas
    ctx.clearRect(0, 0, width, height);
    if (opts.backgroundColor !== "transparent") {
      ctx.fillStyle = opts.backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    const ow = Math.ceil(width / DOWNSAMPLE);
    const oh = Math.ceil(height / DOWNSAMPLE);
    ensureOffscreen(width, height);
    if (!offCtx) return;

    // Clear offscreen
    offCtx.clearRect(0, 0, ow, oh);
    offCtx.globalCompositeOperation = "lighter";

    const amp = ow * opts.waveAmplitude;
    const segs = opts.scanlines ? SEGMENTS_SCANLINE : SEGMENTS_SMOOTH;
    const bandH = oh / segs;

    for (const c of curtains) {
      const color = opts.colors[c.colorIdx % opts.colors.length];
      const halfW = ow * opts.curtainWidth * 0.5 * c.widthMult;
      const baseX = c.baseX * ow;

      for (let i = 0; i < segs; i++) {
        const yFrac = i / segs;
        const y = i * bandH;

        // Slow sway driven by noise
        const sway = simplex3(c.seed, yFrac * 1.2 * c.freqMult, time * 0.05 * c.speedMult) * amp;
        const drift = simplex3(c.seed + 200, yFrac * 0.4, time * 0.03 * c.speedMult) * amp * 0.6;
        const cx = baseX + sway + drift;

        // Vertical intensity: fade at top/bottom edges
        const vFade = Math.sin(yFrac * Math.PI);
        // Brightness variation along height
        const bright = 0.5 + 0.5 * simplex3(c.seed + 500, yFrac * 2, time * 0.04);
        const alpha = vFade * bright;

        if (alpha < 0.01) continue;

        offCtx.globalAlpha = alpha;

        // Horizontal gradient: transparent → color → transparent
        const grad = offCtx.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(0.3, color);
        grad.addColorStop(0.5, color);
        grad.addColorStop(0.7, color);
        grad.addColorStop(1, "transparent");

        offCtx.fillStyle = grad;
        offCtx.fillRect(cx - halfW, y, halfW * 2, bandH + 1);
      }
    }

    offCtx.globalAlpha = 1;
    offCtx.globalCompositeOperation = "source-over";

    // Draw the low-res aurora onto the main canvas — upscaling provides natural blur
    ctx.save();
    ctx.globalAlpha = opts.opacity;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(offscreen!, 0, 0, ow, oh, 0, 0, width, height);
    ctx.restore();
  }

  return {
    mount(container: HTMLElement) {
      curtains = buildCurtains(opts.curtains);

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

    update(newOptions: Partial<AuroraOptions>) {
      const prevCurtains = opts.curtains;
      opts = { ...opts, ...newOptions };
      if (newOptions.curtains !== undefined && newOptions.curtains !== prevCurtains) {
        curtains = buildCurtains(opts.curtains);
      }
      drawFrame();
    },
  };
}
