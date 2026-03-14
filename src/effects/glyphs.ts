import { createCanvas } from "../core/canvas.js";
import { createLoop } from "../core/loop.js";
import { prefersReducedMotion, onReducedMotionChange } from "../core/reducedMotion.js";
import type { BackgroundEffect } from "../core/types.js";

export interface GlyphsOptions {
  /** Characters to pick from. Default: "01/\\|-.:#@*+=><%$" */
  charset?: string;
  /** Glyph color or array of colors. Default: "rgba(255,255,255,0.12)" */
  color?: string | string[];
  /** Canvas background color. Default: "transparent" */
  backgroundColor?: string;
  /** Number of floating glyphs. Default: 40 */
  count?: number;
  /** Minimum drift speed in px/s. Default: 0.5 */
  minSpeed?: number;
  /** Maximum drift speed in px/s. Default: 1.5 */
  maxSpeed?: number;
  /** Minimum glyph opacity. Default: 0.04 */
  minOpacity?: number;
  /** Maximum glyph opacity. Default: 0.18 */
  maxOpacity?: number;
  /** Font size in px. Default: 14 */
  fontSize?: number;
  /** Font family. Default: "monospace" */
  fontFamily?: string;
  /** Min frames between character flickers. Default: 40 */
  minFlickerInterval?: number;
  /** Max frames between character flickers. Default: 120 */
  maxFlickerInterval?: number;
  /** Enable animation. Default: true */
  animated?: boolean;
  /** Respect prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;
}

const DEFAULTS: Required<GlyphsOptions> = {
  charset: "01/\\|-.:#@*+=><%$",
  color: "rgba(255,255,255,0.12)",
  backgroundColor: "transparent",
  count: 40,
  minSpeed: 0.5,
  maxSpeed: 1.5,
  minOpacity: 0.04,
  maxOpacity: 0.18,
  fontSize: 14,
  fontFamily: "monospace",
  minFlickerInterval: 40,
  maxFlickerInterval: 120,
  animated: true,
  respectReducedMotion: true,
};

interface Glyph {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ch: string;
  opacity: number;
  colorIdx: number;
  flickTimer: number;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export interface GlyphsEffect extends BackgroundEffect {
  update(options: Partial<GlyphsOptions>): void;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const result = {} as Partial<T>;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) result[key] = obj[key];
  }
  return result;
}

export function createGlyphs(options: GlyphsOptions = {}): GlyphsEffect {
  let opts = { ...DEFAULTS, ...stripUndefined(options) };

  let canvasHandle: ReturnType<typeof createCanvas> | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let cleanupMotion: (() => void) | null = null;
  let glyphs: Glyph[] = [];
  let colors: string[];

  function randCh(): string {
    return opts.charset[Math.floor(Math.random() * opts.charset.length)];
  }

  function isMotionDisabled(): boolean {
    return opts.respectReducedMotion && prefersReducedMotion();
  }

  function buildGlyphs(w: number, h: number): Glyph[] {
    return Array.from({ length: opts.count }, (_, i) => {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(opts.minSpeed, opts.maxSpeed);
      return {
        x: rand(0, w),
        y: rand(0, h),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ch: randCh(),
        opacity: rand(opts.minOpacity, opts.maxOpacity),
        colorIdx: i % colors.length,
        flickTimer: Math.floor(rand(opts.minFlickerInterval, opts.maxFlickerInterval)),
      };
    });
  }

  function updateGlyphs(dt: number): void {
    if (!canvasHandle) return;
    const { width, height } = canvasHandle;
    const dtS = dt / 1000;

    for (const g of glyphs) {
      g.x += g.vx * dtS * 60;
      g.y += g.vy * dtS * 60;

      // Wrap edges
      if (g.x < -10) g.x = width + 10;
      else if (g.x > width + 10) g.x = -10;
      if (g.y < -10) g.y = height + 10;
      else if (g.y > height + 10) g.y = -10;

      // Flicker: change character and opacity periodically
      if (--g.flickTimer <= 0) {
        g.ch = randCh();
        g.flickTimer = Math.floor(rand(opts.minFlickerInterval, opts.maxFlickerInterval));
        g.opacity = rand(opts.minOpacity, opts.maxOpacity);
      }
    }
  }

  function drawFrame(): void {
    if (!canvasHandle) return;
    const { ctx, width, height } = canvasHandle;

    ctx.clearRect(0, 0, width, height);

    if (opts.backgroundColor !== "transparent") {
      ctx.fillStyle = opts.backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.font = `${opts.fontSize}px ${opts.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const g of glyphs) {
      ctx.globalAlpha = g.opacity;
      ctx.fillStyle = colors[g.colorIdx];
      ctx.fillText(g.ch, g.x, g.y);
    }

    ctx.globalAlpha = 1;
  }

  return {
    mount(container: HTMLElement) {
      colors = Array.isArray(opts.color) ? opts.color : [opts.color];

      canvasHandle = createCanvas(container, (w, h) => {
        glyphs = buildGlyphs(w, h);
        drawFrame();
      });

      glyphs = buildGlyphs(canvasHandle.width, canvasHandle.height);

      const animated = opts.animated && !isMotionDisabled();

      if (animated) {
        loop = createLoop((deltaTime) => {
          updateGlyphs(deltaTime);
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

    resize(w: number, h: number) {
      glyphs = buildGlyphs(w, h);
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

    update(newOptions: Partial<GlyphsOptions>) {
      const prevCount = opts.count;
      opts = { ...opts, ...newOptions };
      colors = Array.isArray(opts.color) ? opts.color : [opts.color];
      if (newOptions.count !== undefined && newOptions.count !== prevCount && canvasHandle) {
        glyphs = buildGlyphs(canvasHandle.width, canvasHandle.height);
      }
      drawFrame();
    },
  };
}
