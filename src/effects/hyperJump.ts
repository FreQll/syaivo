import { createCanvas } from "../core/canvas.js";
import { createLoop } from "../core/loop.js";
import { prefersReducedMotion, onReducedMotionChange } from "../core/reducedMotion.js";
import type { BackgroundEffect } from "../core/types.js";

export interface HyperJumpOptions {
  /** Up to 3 pixel colors. Default: ["#a5f3fc"] */
  colors?: string[];
  /** Canvas background. Default: "#0a0a0a" */
  backgroundColor?: string;
  /** Number of pixels in the tunnel. Default: 400 */
  count?: number;
  /** Minimum pixel size in px. Default: 1 */
  minSize?: number;
  /** Maximum pixel size in px (reached at edges). Default: 6 */
  maxSize?: number;
  /** Base outward speed multiplier. Default: 1 */
  speed?: number;
  /** Number of trail segments behind each pixel. Default: 6 */
  trailSegments?: number;
  /** Horizontal center (0–1). Default: 0.5 */
  centerX?: number;
  /** Vertical center (0–1). Default: 0.5 */
  centerY?: number;
  /** Enable animation. Default: true */
  animated?: boolean;
  /** Respect prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;
}

const DEFAULTS: Required<HyperJumpOptions> = {
  colors: ["#a5f3fc"],
  backgroundColor: "#0a0a0a",
  count: 400,
  minSize: 1,
  maxSize: 6,
  speed: 1,
  trailSegments: 6,
  centerX: 0.5,
  centerY: 0.5,
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
  return { r: 165, g: 243, b: 252 };
}

function parseColor(str: string): RGB {
  return str.startsWith("#") ? parseHex(str) : parseRgba(str);
}

// ── Star particle ─────────────────────────────────────────────────────────

/** Max trail history entries stored per star. */
const MAX_HISTORY = 12;

interface Star {
  /** Distance from center as fraction (0 = center, 1 = edge). */
  dist: number;
  /** Angle in radians. */
  angle: number;
  /** Individual speed variance. */
  speedMult: number;
  /** Color index into parsed colors array. */
  colorIdx: number;
  /** Ring buffer of previous distances for pixelated trail. */
  history: number[];
  /** Write head for ring buffer. */
  histHead: number;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export interface HyperJumpEffect extends BackgroundEffect {
  update(options: Partial<HyperJumpOptions>): void;
}

export function createHyperJump(options: HyperJumpOptions = {}): HyperJumpEffect {
  let opts = { ...DEFAULTS, ...options };

  let canvasHandle: ReturnType<typeof createCanvas> | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let cleanupMotion: (() => void) | null = null;
  let stars: Star[] = [];
  let parsedColors: RGB[] = [];

  function rebuildColors(): void {
    parsedColors = opts.colors.slice(0, 3).map(parseColor);
  }

  function spawnStar(initialSpread: boolean): Star {
    const dist = initialSpread ? rand(0, 1) : rand(0, 0.02);
    const history = new Array(MAX_HISTORY).fill(dist);
    return {
      dist,
      angle: Math.random() * Math.PI * 2,
      speedMult: rand(0.5, 1.5),
      colorIdx: Math.floor(Math.random() * parsedColors.length),
      history,
      histHead: 0,
    };
  }

  function buildStars(count: number): Star[] {
    return Array.from({ length: count }, () => spawnStar(true));
  }

  function isMotionDisabled(): boolean {
    return opts.respectReducedMotion && prefersReducedMotion();
  }

  function drawFrame(dt: number): void {
    if (!canvasHandle) return;
    const { ctx, width, height } = canvasHandle;

    ctx.clearRect(0, 0, width, height);
    if (opts.backgroundColor !== "transparent") {
      ctx.fillStyle = opts.backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    const cx = width * opts.centerX;
    const cy = height * opts.centerY;
    const maxR = Math.sqrt(
      Math.max(cx, width - cx) ** 2 + Math.max(cy, height - cy) ** 2,
    );

    const dtS = dt / 1000;
    const trailSegs = Math.max(0, Math.min(opts.trailSegments, MAX_HISTORY));

    for (const s of stars) {
      // Record current distance in history
      s.history[s.histHead] = s.dist;
      s.histHead = (s.histHead + 1) % MAX_HISTORY;

      // Accelerate outward
      s.dist += dtS * opts.speed * s.speedMult * (0.15 + s.dist * 0.85);

      // Respawn
      if (s.dist > 1.1) {
        const ns = spawnStar(false);
        s.dist = ns.dist;
        s.angle = ns.angle;
        s.speedMult = ns.speedMult;
        s.colorIdx = ns.colorIdx;
        s.history.fill(s.dist);
        s.histHead = 0;
        continue;
      }

      const cosA = Math.cos(s.angle);
      const sinA = Math.sin(s.angle);
      const t = s.dist;
      const { r: cr, g: cg, b: cb } = parsedColors[s.colorIdx % parsedColors.length];

      // Head pixel size
      const headSize = opts.minSize + (opts.maxSize - opts.minSize) * t;
      const headAlpha = Math.min(1, t * 3);

      // Draw trail segments (oldest first so head draws on top)
      if (trailSegs > 0 && t > 0.04) {
        for (let i = trailSegs; i >= 1; i--) {
          // Read from ring buffer: i steps back
          const idx = ((s.histHead - 1 - i) % MAX_HISTORY + MAX_HISTORY) % MAX_HISTORY;
          const hDist = s.history[idx];

          // Skip if trail segment is behind or at the same place
          if (hDist >= t || hDist < 0.01) continue;

          const segR = hDist * maxR;
          const sx = cx + cosA * segR;
          const sy = cy + sinA * segR;

          // Trail pixels shrink and fade with age
          const ageFrac = i / (trailSegs + 1); // 0 = newest, 1 = oldest
          const segSize = headSize * (1 - ageFrac * 0.6);
          const segAlpha = headAlpha * (1 - ageFrac) * 0.5;

          if (segAlpha < 0.01) continue;

          ctx.fillStyle = `rgba(${cr},${cg},${cb},${segAlpha})`;
          const half = segSize / 2;
          // Snap to pixel grid for crisp pixelated trail
          ctx.fillRect(
            Math.round(sx - half),
            Math.round(sy - half),
            Math.round(segSize),
            Math.round(segSize),
          );
        }
      }

      // Draw head pixel
      const r = t * maxR;
      const x = cx + cosA * r;
      const y = cy + sinA * r;

      ctx.fillStyle = `rgba(${cr},${cg},${cb},${headAlpha})`;
      const half = headSize / 2;
      ctx.fillRect(
        Math.round(x - half),
        Math.round(y - half),
        Math.round(headSize),
        Math.round(headSize),
      );
    }
  }

  return {
    mount(container: HTMLElement) {
      rebuildColors();
      stars = buildStars(opts.count);

      canvasHandle = createCanvas(container, () => {
        drawFrame(0);
      });

      const animated = opts.animated && !isMotionDisabled();

      if (animated) {
        loop = createLoop((deltaTime) => {
          drawFrame(deltaTime);
        });
        loop.start();
      } else {
        drawFrame(0);
      }

      if (opts.respectReducedMotion) {
        cleanupMotion = onReducedMotionChange((reduced) => {
          if (reduced) {
            loop?.stop();
            drawFrame(0);
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
      drawFrame(0);
    },

    pause() {
      loop?.stop();
    },

    resume() {
      if (opts.animated && !isMotionDisabled()) {
        loop?.start();
      }
    },

    update(newOptions: Partial<HyperJumpOptions>) {
      const prevCount = opts.count;
      opts = { ...opts, ...newOptions };
      if (newOptions.colors !== undefined) {
        rebuildColors();
      }
      if (newOptions.count !== undefined && newOptions.count !== prevCount) {
        stars = buildStars(opts.count);
      }
      drawFrame(0);
    },
  };
}
