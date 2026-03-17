import { createCanvas } from "../core/canvas.js";
import { createLoop } from "../core/loop.js";
import { simplex2 } from "../core/noise.js";
import { prefersReducedMotion, onReducedMotionChange } from "../core/reducedMotion.js";
import type { BackgroundEffect } from "../core/types.js";

export interface LuminaOptions {
  /** Background color. Default: "#0a0a0a" */
  backgroundColor?: string;
  /** Beam highlight color. Default: "#ffffff" */
  beamColor?: string;
  /** Number of light beams. Default: 5 */
  beams?: number;
  /** Central beam direction in degrees from horizontal (0 = right, 90 = down). Default: 35 */
  angle?: number;
  /** Maximum beam brightness (0–1). Default: 0.18 */
  intensity?: number;
  /** Beam softness — larger = more diffuse (0.05–0.5). Default: 0.15 */
  softness?: number;
  /** Grain intensity (0–1). Default: 0.06 */
  grain?: number;
  /** Grain shimmer speed multiplier. Default: 1 */
  grainSpeed?: number;
  /** Beam drift speed multiplier. Default: 1 */
  beamSpeed?: number;
  /** Global speed multiplier. Default: 1 */
  speed?: number;
  /** Enable animation. Default: true */
  animated?: boolean;
  /** Respect prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;
}

const DEFAULTS: Required<LuminaOptions> = {
  backgroundColor: "#0a0a0a",
  beamColor: "#ffffff",
  beams: 5,
  angle: 35,
  intensity: 0.18,
  softness: 0.15,
  grain: 0.06,
  grainSpeed: 1,
  beamSpeed: 1,
  speed: 1,
  animated: true,
  respectReducedMotion: true,
};

// ── Beam definition ──────────────────────────────────────────────────────

interface Beam {
  /** Normalized center position along the perpendicular axis (0–1) */
  center: number;
  /** Normalized width (softness multiplier) */
  width: number;
  /** Relative brightness (0–1) */
  brightness: number;
  /** Drift phase offset */
  phase: number;
}

function seededBeams(count: number): Beam[] {
  const beams: Beam[] = [];
  // Distribute beams across the canvas with variation
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    beams.push({
      center: t * 0.8 + 0.1, // keep within 10–90% range
      width: 0.6 + (i % 3) * 0.3, // vary widths
      brightness: 0.5 + (((i * 7 + 3) % 5) / 5) * 0.5, // vary brightness
      phase: i * 1.7, // unique drift phase
    });
  }
  return beams;
}

// ── Effect ────────────────────────────────────────────────────────────────

export interface LuminaEffect extends BackgroundEffect {
  update(options: Partial<LuminaOptions>): void;
}

export function createLumina(options: LuminaOptions = {}): LuminaEffect {
  let opts = { ...DEFAULTS, ...options };

  let canvasHandle: ReturnType<typeof createCanvas> | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let cleanupMotion: (() => void) | null = null;
  let time = 0;
  let beams: Beam[] = seededBeams(opts.beams);

  // Beam offscreen — rendered at low resolution for natural softness
  let beamCanvas: HTMLCanvasElement | null = null;
  let beamCtx: CanvasRenderingContext2D | null = null;
  const BEAM_SCALE = 4;

  // Grain offscreen — tiny canvas, redrawn every frame for shimmer
  let grainCanvas: HTMLCanvasElement | null = null;
  let grainCtx: CanvasRenderingContext2D | null = null;
  let grainData: ImageData | null = null;
  // Downscale grain for performance
  const GRAIN_SCALE = 2;

  function isMotionDisabled(): boolean {
    return opts.respectReducedMotion && prefersReducedMotion();
  }

  function ensureBeamCanvas(w: number, h: number): void {
    const bw = Math.ceil(w / BEAM_SCALE);
    const bh = Math.ceil(h / BEAM_SCALE);
    if (!beamCanvas || beamCanvas.width !== bw || beamCanvas.height !== bh) {
      beamCanvas = document.createElement("canvas");
      beamCanvas.width = bw;
      beamCanvas.height = bh;
      beamCtx = beamCanvas.getContext("2d")!;
    }
  }

  function ensureGrainCanvas(w: number, h: number): void {
    const gw = Math.ceil(w / GRAIN_SCALE);
    const gh = Math.ceil(h / GRAIN_SCALE);
    if (!grainCanvas || grainCanvas.width !== gw || grainCanvas.height !== gh) {
      grainCanvas = document.createElement("canvas");
      grainCanvas.width = gw;
      grainCanvas.height = gh;
      grainCtx = grainCanvas.getContext("2d")!;
      grainData = grainCtx.createImageData(gw, gh);
    }
  }

  // ── Beam rendering ─────────────────────────────────────────────────────
  // Renders volumetric light rays from top-left onto a low-res offscreen
  // canvas, then stretches to full size for natural softness.

  function drawBeams(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ensureBeamCanvas(w, h);
    if (!beamCtx || !beamCanvas) return;

    const bw = beamCanvas.width;
    const bh = beamCanvas.height;
    const diag = Math.sqrt(bw * bw + bh * bh);
    const driftSpeed = opts.beamSpeed * opts.speed;

    // Light source: top-left, slightly off-screen (in beam-canvas coords)
    const srcX = -bw * 0.15;
    const srcY = -bh * 0.15;

    // Central direction of beam spread (degrees from horizontal)
    const centerAngle = (opts.angle * Math.PI) / 180;
    // Total angular arc the beams span (~70°)
    const arcSpread = Math.PI * 0.4;

    // Blur on the low-res canvas — amplified by the downscale
    const blurPx = Math.max(2, Math.round(diag * opts.softness * 0.08));

    beamCtx.clearRect(0, 0, bw, bh);
    beamCtx.save();
    beamCtx.globalCompositeOperation = "lighter";
    beamCtx.filter = `blur(${blurPx}px)`;

    // ── Ambient glow near source ──────────────────────────────────────
    const glowGrad = beamCtx.createRadialGradient(srcX, srcY, 0, srcX, srcY, diag * 0.7);
    glowGrad.addColorStop(0, `rgba(255,255,255,${(opts.intensity * 0.4).toFixed(3)})`);
    glowGrad.addColorStop(0.25, `rgba(255,255,255,${(opts.intensity * 0.12).toFixed(3)})`);
    glowGrad.addColorStop(1, "transparent");
    beamCtx.fillStyle = glowGrad;
    beamCtx.fillRect(0, 0, bw, bh);

    // ── Individual beams ──────────────────────────────────────────────
    for (const beam of beams) {
      // Slow drift using noise for organic feel
      const drift = simplex2(beam.phase + time * 0.03 * driftSpeed, beam.phase * 0.5) * 0.04;
      // Map beam center (0–1) to an angle within the arc
      const angle = centerAngle + (beam.center - 0.5 + drift) * arcSpread;

      // Breathing brightness
      const breathe = 1 + simplex2(time * 0.02 * driftSpeed, beam.phase) * 0.15;
      const alpha = Math.min(opts.intensity * beam.brightness * breathe, 1);

      // Wide angular half-width — creates visible cone shapes, not lines
      const halfAngle = beam.width * 0.08 + opts.softness * 0.15;

      // Far-end points of the beam wedge
      const r = diag * 1.5;
      const lx = srcX + Math.cos(angle - halfAngle) * r;
      const ly = srcY + Math.sin(angle - halfAngle) * r;
      const rx = srcX + Math.cos(angle + halfAngle) * r;
      const ry = srcY + Math.sin(angle + halfAngle) * r;

      // Radial gradient: bright near source, fading with distance
      const grad = beamCtx.createRadialGradient(srcX, srcY, diag * 0.02, srcX, srcY, diag * 1.3);
      grad.addColorStop(0, `rgba(255,255,255,${(alpha * 0.9).toFixed(3)})`);
      grad.addColorStop(0.15, `rgba(255,255,255,${alpha.toFixed(3)})`);
      grad.addColorStop(0.45, `rgba(255,255,255,${(alpha * 0.5).toFixed(3)})`);
      grad.addColorStop(0.8, `rgba(255,255,255,${(alpha * 0.1).toFixed(3)})`);
      grad.addColorStop(1, "transparent");

      beamCtx.fillStyle = grad;
      beamCtx.beginPath();
      beamCtx.moveTo(srcX, srcY);
      beamCtx.lineTo(lx, ly);
      beamCtx.lineTo(rx, ry);
      beamCtx.closePath();
      beamCtx.fill();
    }

    beamCtx.restore();

    // Stretch low-res beam canvas to full size — bilinear interpolation
    // naturally smooths the edges further, creating a volumetric look
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(beamCanvas, 0, 0, w, h);
    ctx.restore();
  }

  // ── Grain rendering ────────────────────────────────────────────────────
  // Random noise written to small ImageData, stretched to fill

  function drawGrain(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (opts.grain <= 0) return;

    ensureGrainCanvas(w, h);
    if (!grainCtx || !grainData) return;

    const data = grainData.data;
    const len = data.length;
    // Fast pseudo-random: use time as seed shift for shimmer
    // Math.random() is fine here — we want pure noise, not coherent patterns
    const alpha = Math.round(opts.grain * 255);

    for (let i = 0; i < len; i += 4) {
      const v = (Math.random() * 255) | 0;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = alpha;
    }

    grainCtx.putImageData(grainData, 0, 0);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(grainCanvas!, 0, 0, w, h);
    ctx.restore();
  }

  // ── Composite ──────────────────────────────────────────────────────────

  function drawFrame(): void {
    if (!canvasHandle) return;
    const { ctx, width: w, height: h } = canvasHandle;

    // Background
    ctx.fillStyle = opts.backgroundColor;
    ctx.fillRect(0, 0, w, h);

    // Light beams
    drawBeams(ctx, w, h);

    // Film grain overlay
    drawGrain(ctx, w, h);
  }

  return {
    mount(container: HTMLElement) {
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
      beamCanvas = null;
      beamCtx = null;
      grainCanvas = null;
      grainCtx = null;
      grainData = null;
    },

    resize(_w: number, _h: number) {
      beamCanvas = null;
      beamCtx = null;
      grainCanvas = null;
      grainCtx = null;
      grainData = null;
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

    update(newOptions: Partial<LuminaOptions>) {
      opts = { ...opts, ...newOptions };
      if (newOptions.beams !== undefined) {
        beams = seededBeams(opts.beams);
      }
      drawFrame();
    },
  };
}
