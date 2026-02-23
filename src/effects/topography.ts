import { createCanvas } from "../core/canvas.js";
import { createLoop } from "../core/loop.js";
import { fbm3 } from "../core/noise.js";
import { prefersReducedMotion, onReducedMotionChange } from "../core/reducedMotion.js";
import type { BackgroundEffect } from "../core/types.js";

export interface TopographyOptions {
  /** Contour line color. Default: "rgba(255,255,255,0.25)" */
  lineColor?: string;
  /** Canvas background color. Default: "transparent" */
  backgroundColor?: string;
  /**
   * Pixel size of each grid cell. Smaller = denser grid, smoother curves.
   * Range 4–40. Default: 10
   */
  detail?: number;
  /** Number of contour threshold levels. Default: 14 */
  levels?: number;
  /** Line stroke width in CSS pixels. Default: 0.8 */
  lineWidth?: number;
  /** Animation speed multiplier. Range 0–0.8. Default: 0.4 */
  speed?: number;
  /** Enable animation. Default: true */
  animated?: boolean;
  /**
   * Noise feature scale — higher zooms out (fewer, larger hills).
   * Range 0.002–0.012. Default: 0.004
   */
  noiseScale?: number;
  /**
   * Domain warp strength. Range 0–1.5. Default: 0.5
   */
  warpStrength?: number;
  /** Respect prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;
}

export interface TopographyEffect extends BackgroundEffect {
  /** Dynamically update options without recreating the effect. */
  update(options: Partial<TopographyOptions>): void;
}

const DEFAULTS: Required<TopographyOptions> = {
  lineColor: "rgba(255,255,255,0.25)",
  backgroundColor: "transparent",
  detail: 10,
  levels: 14,
  lineWidth: 0.8,
  speed: 0.4,
  animated: true,
  noiseScale: 0.004,
  warpStrength: 0.5,
  respectReducedMotion: true,
};

// ─── Config clamping ──────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

interface SanitizedOpts extends Required<TopographyOptions> {
  _detail:       number;
  _noiseScale:   number;
  _speed:        number;
  _warpStrength: number;
}

const MAX_LEVELS = 64;

function sanitize(raw: Required<TopographyOptions>): SanitizedOpts {
  return {
    ...raw,
    levels:        clamp(Math.round(raw.levels), 1, MAX_LEVELS - 1),
    _detail:       clamp(raw.detail,       4,     40),
    _noiseScale:   clamp(raw.noiseScale,   0.002, 0.012),
    _speed:        clamp(raw.speed,        0,     0.8),
    _warpStrength: clamp(raw.warpStrength, 0,     1.5),
  };
}

// ─── Marching squares ─────────────────────────────────────────────────────────
//
// Bit encoding: tl=8, tr=4, br=2, bl=1  (same as reference)
// We store [edgeA, edgeB] pairs; for saddles (5, 10) two pairs.
// Edge indices: 0=top, 1=right, 2=bottom, 3=left
//
// For each edge crossing we compute the interpolated point on-the-fly using
// linInterpolate, matching the reference exactly.

// Pre-allocated noise grid — max 512 cells per axis
// At detail=4 on 2560px: 641 cols. Capped at 512 gracefully.
const MAX_GRID = 512;
const grid = new Float32Array(MAX_GRID * MAX_GRID);

export function createTopography(
  options: TopographyOptions = {}
): TopographyEffect {
  let opts = sanitize({ ...DEFAULTS, ...options });

  let canvasHandle: ReturnType<typeof createCanvas> | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let time = 0;
  let cleanupMotion: (() => void) | null = null;

  function isMotionDisabled(): boolean {
    return opts.respectReducedMotion && prefersReducedMotion();
  }

  // Linear interpolation of edge crossing (matches reference linInterpolate)
  function edgeLerp(v0: number, v1: number, threshold: number): number {
    if (v0 === v1) return 0.5;
    return (threshold - v0) / (v1 - v0);
  }

  function drawFrame(): void {
    if (!canvasHandle) return;
    const { ctx, width, height } = canvasHandle;

    ctx.clearRect(0, 0, width, height);
    if (opts.backgroundColor !== "transparent") {
      ctx.fillStyle = opts.backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    const res   = opts._detail;
    const cols  = Math.min(Math.floor(width  / res) + 1, MAX_GRID - 1);
    const rows  = Math.min(Math.floor(height / res) + 1, MAX_GRID - 1);

    const scale = opts._noiseScale;
    const warp  = opts._warpStrength;
    const t     = time;

    // ── Fill noise grid ────────────────────────────────────────────────────
    //
    // Use the same coordinate system as the reference: cell (x, y) maps to
    // pixel (x*res, y*res).  We sample 3D fBm with domain warp.
    // Warp is kept mild (single stage, 2 octaves) to avoid crossing lines.

    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const px = c * scale;
        const py = r * scale;

        // Single-stage domain warp — mild, prevents line crossings
        const wx = fbm3(px,       py,       t,       2) * warp;
        const wy = fbm3(px + 5.2, py + 1.3, t + 1.7, 2) * warp;

        // Final terrain value in [-1, 1], rescaled to [0, 100] like the reference
        const raw = fbm3(px + wx, py + wy, t * 0.5, 4);
        grid[r * MAX_GRID + c] = (raw + 1) * 50; // maps [-1,1] → [0,100]
      }
    }

    // ── Marching squares, one path per threshold level ──────────────────────
    //
    // All segments for a given threshold are batched into a single path and
    // stroked once — identical to the reference renderAtThreshold() pattern.
    // This guarantees no per-segment state changes and no chain/spline needed:
    // at res=10 each segment is 10px, which looks smooth at screen resolution.

    const levelCount = opts.levels;

    // Find actual noise range to distribute thresholds inside it (like reference)
    let noiseMin = 100;
    let noiseMax = 0;
    const totalPts = (rows + 1) * (cols + 1);
    for (let i = 0; i < totalPts; i++) {
      const v = grid[i];
      if (v < noiseMin) noiseMin = v;
      if (v > noiseMax) noiseMax = v;
    }

    // Distribute thresholds evenly between min and max
    const step = (noiseMax - noiseMin) / (levelCount + 1);

    ctx.strokeStyle = opts.lineColor;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";

    for (let lvl = 1; lvl <= levelCount; lvl++) {
      const threshold = noiseMin + step * lvl;

      ctx.beginPath();
      ctx.lineWidth = opts.lineWidth;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const nw = grid[r       * MAX_GRID + c    ];
          const ne = grid[r       * MAX_GRID + c + 1];
          const se = grid[(r + 1) * MAX_GRID + c + 1];
          const sw = grid[(r + 1) * MAX_GRID + c    ];

          // All four corners same side → no crossing
          const aboveNW = nw >= threshold;
          const aboveNE = ne >= threshold;
          const aboveSE = se >= threshold;
          const aboveSW = sw >= threshold;
          if (aboveNW === aboveNE && aboveNE === aboveSE && aboveSE === aboveSW) continue;

          const caseIdx =
            (aboveNW ? 8 : 0) |
            (aboveNE ? 4 : 0) |
            (aboveSE ? 2 : 0) |
            (aboveSW ? 1 : 0);

          // Pixel origin of this cell
          const x = c * res;
          const y = r * res;

          // Edge crossing points (computed only when needed by case)
          // a=top, b=right, c=bottom, d=left  — matches reference naming
          let ax = NaN, ay = NaN;
          let bx = NaN, by = NaN;
          let cx = NaN, cy = NaN;
          let dx = NaN, dy = NaN;

          function getA() { if (ax !== ax) { ax = x + res * edgeLerp(nw, ne, threshold); ay = y;       } }
          function getB() { if (bx !== bx) { bx = x + res;                               by = y + res * edgeLerp(ne, se, threshold); } }
          function getC() { if (cx !== cx) { cx = x + res * edgeLerp(sw, se, threshold); cy = y + res; } }
          function getD() { if (dx !== dx) { dx = x;                                     dy = y + res * edgeLerp(nw, sw, threshold); } }

          switch (caseIdx) {
            case 1: case 14: getC(); getD(); ctx.moveTo(dx, dy); ctx.lineTo(cx, cy); break;
            case 2: case 13: getB(); getC(); ctx.moveTo(bx, by); ctx.lineTo(cx, cy); break;
            case 3: case 12: getB(); getD(); ctx.moveTo(dx, dy); ctx.lineTo(bx, by); break;
            case 4: case 11: getA(); getB(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); break;
            case 6: case  9: getA(); getC(); ctx.moveTo(cx, cy); ctx.lineTo(ax, ay); break;
            case 7: case  8: getA(); getD(); ctx.moveTo(dx, dy); ctx.lineTo(ax, ay); break;
            case 5:
              getA(); getB(); getC(); getD();
              ctx.moveTo(dx, dy); ctx.lineTo(ax, ay);
              ctx.moveTo(cx, cy); ctx.lineTo(bx, by);
              break;
            case 10:
              getA(); getB(); getC(); getD();
              ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
              ctx.moveTo(cx, cy); ctx.lineTo(dx, dy);
              break;
          }
        }
      }

      ctx.stroke();
    }
  }

  const effect: TopographyEffect = {
    mount(container: HTMLElement) {
      canvasHandle = createCanvas(container, () => {
        drawFrame();
      });

      const animated = opts.animated && !isMotionDisabled();

      if (animated) {
        loop = createLoop((deltaTime) => {
          time += (deltaTime / 1000) * opts._speed * 0.04;
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

    resize(_width: number, _height: number) {
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

    update(newOptions: Partial<TopographyOptions>) {
      const wasAnimated = opts.animated;
      opts = sanitize({ ...opts, ...newOptions });

      if (newOptions.animated !== undefined) {
        if (!opts.animated || isMotionDisabled()) {
          loop?.stop();
        } else if (!wasAnimated && opts.animated) {
          loop?.start();
        }
      }

      drawFrame();
    },
  };

  return effect;
}
