import { createCanvas } from "../core/canvas.js";
import { createLoop } from "../core/loop.js";
import { simplex3 } from "../core/noise.js";
import { prefersReducedMotion, onReducedMotionChange } from "../core/reducedMotion.js";
import type { BackgroundEffect } from "../core/types.js";

export interface LiquidSilkOptions {
  /** Base background color. Default: "#020208" */
  backgroundColor?: string;
  /** Iridescent color stops. Default: neon cyan, magenta, deep blue */
  colors?: string[];
  /** Noise scale — higher = more folds. Default: 1.2 */
  scale?: number;
  /** Normal strength — higher = sharper ridges. Default: 1.4 */
  normalStrength?: number;
  /** Specular intensity. Default: 0.65 */
  specular?: number;
  /** Specular exponent. Default: 16 */
  shininess?: number;
  /** Ambient (0–1). Default: 0.1 */
  ambient?: number;
  /** Diffuse (0–1). Default: 0.55 */
  diffuse?: number;
  /** Blur radius in px applied on composite (0 = no blur). Default: 0 */
  blur?: number;
  /** Film grain intensity (0–1, 0 = no grain). Default: 0 */
  grain?: number;
  /** Speed multiplier. Default: 1 */
  speed?: number;
  /** Opacity. Default: 1 */
  opacity?: number;
  /** Animate. Default: true */
  animated?: boolean;
  /** Respect prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;
}

const DEFAULTS: Required<LiquidSilkOptions> = {
  backgroundColor: "#020208",
  colors: ["#00e5ff", "#d500f9", "#0a1a5c", "#00d4aa", "#f050ff"],
  scale: 1.2,
  normalStrength: 1.4,
  specular: 0.65,
  shininess: 16,
  ambient: 0.1,
  diffuse: 0.55,
  blur: 0,
  grain: 0,
  speed: 1,
  opacity: 1,
  animated: true,
  respectReducedMotion: true,
};

/**
 * Render at 1/4 resolution, then upscale with a gentle blur.
 * The height field is buffered so normals come from buffer lookups (free)
 * instead of extra noise calls. Total: 3 simplex3 per pixel (2 warp + 1 height).
 */
const STEP = 4;

export interface LiquidSilkEffect extends BackgroundEffect {
  update(options: Partial<LiquidSilkOptions>): void;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length >= 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  return [2, 2, 8];
}

export function createLiquidSilk(options: LiquidSilkOptions = {}): LiquidSilkEffect {
  let opts = { ...DEFAULTS, ...options };

  let canvasHandle: ReturnType<typeof createCanvas> | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let cleanupMotion: (() => void) | null = null;
  let time = 0;

  let offscreen: HTMLCanvasElement | null = null;
  let offCtx: CanvasRenderingContext2D | null = null;
  let imgData: ImageData | null = null;
  let heightBuf: Float32Array | null = null;

  let palR = new Float32Array(0);
  let palG = new Float32Array(0);
  let palB = new Float32Array(0);
  let palLen = 0;

  // Pre-computed light half-vectors
  let L1x = 0, L1y = 0, L1z = 0, H1x = 0, H1y = 0, H1z = 0;
  let L2x = 0, L2y = 0, L2z = 0, H2x = 0, H2y = 0, H2z = 0;

  function precompute(): void {
    const colors = opts.colors.map(hexToRgb);
    palLen = colors.length;
    palR = new Float32Array(palLen);
    palG = new Float32Array(palLen);
    palB = new Float32Array(palLen);
    for (let i = 0; i < palLen; i++) {
      palR[i] = colors[i][0]; palG[i] = colors[i][1]; palB[i] = colors[i][2];
    }

    // Light 1: upper-left
    let x = -0.4, y = -0.5, z = 0.76;
    let l = Math.sqrt(x * x + y * y + z * z);
    L1x = x / l; L1y = y / l; L1z = z / l;
    x = L1x; y = L1y; z = L1z + 1;
    l = Math.sqrt(x * x + y * y + z * z);
    H1x = x / l; H1y = y / l; H1z = z / l;

    // Light 2: lower-right rim
    x = 0.5; y = 0.4; z = 0.55;
    l = Math.sqrt(x * x + y * y + z * z);
    L2x = x / l; L2y = y / l; L2z = z / l;
    x = L2x; y = L2y; z = L2z + 1;
    l = Math.sqrt(x * x + y * y + z * z);
    H2x = x / l; H2y = y / l; H2z = z / l;
  }

  function isMotionDisabled(): boolean {
    return opts.respectReducedMotion && prefersReducedMotion();
  }

  function ensureOffscreen(w: number, h: number): void {
    const ow = Math.ceil(w / STEP);
    const oh = Math.ceil(h / STEP);
    if (!offscreen || offscreen.width !== ow || offscreen.height !== oh) {
      offscreen = document.createElement("canvas");
      offscreen.width = ow;
      offscreen.height = oh;
      offCtx = offscreen.getContext("2d")!;
      imgData = offCtx.createImageData(ow, oh);
      heightBuf = new Float32Array(ow * oh);
    }
  }

  function drawFrame(): void {
    if (!canvasHandle) return;
    const { ctx, width, height } = canvasHandle;

    const ow = Math.ceil(width / STEP);
    const oh = Math.ceil(height / STEP);
    ensureOffscreen(width, height);
    if (!offCtx || !imgData || !heightBuf) return;

    const [bgR, bgG, bgB] = hexToRgb(opts.backgroundColor);
    const data = imgData.data;
    const hBuf = heightBuf;

    const sc = opts.scale;
    const sX = sc / ow;
    const sY = sc / oh;
    const nStr = opts.normalStrength;

    const ambient = opts.ambient;
    const diffStr = opts.diffuse;
    const specStr = opts.specular;
    const shin = opts.shininess;
    const shin2 = shin * 0.7;
    const specStr2 = specStr * 0.35;
    const diffStr2 = diffStr * 0.3;

    const t = time * 0.07;

    // === Pass 1: fill height buffer (3 noise calls per pixel) ===
    for (let py = 0; py < oh; py++) {
      const ny = py * sY;
      const rowOff = py * ow;
      for (let px = 0; px < ow; px++) {
        const nx = px * sX;
        // Domain warp for organic flowing shapes
        const wx = simplex3(nx + 5.2, ny + 1.3, t) * 0.35;
        const wy = simplex3(nx + 9.7, ny + 4.8, t) * 0.35;
        hBuf[rowOff + px] = simplex3(nx + wx, ny + wy, t * 0.8);
      }
    }

    // === Pass 2: compute normals from buffer + shade ===
    for (let py = 0; py < oh; py++) {
      const rowOff = py * ow;
      const rowBelow = py + 1 < oh ? (py + 1) * ow : rowOff; // clamp
      for (let px = 0; px < ow; px++) {
        const hc = hBuf[rowOff + px];
        const hRight = px + 1 < ow ? hBuf[rowOff + px + 1] : hc;
        const hDown = hBuf[rowBelow + px];

        // Normal from buffer differences (no epsilon needed — it's 1 pixel)
        const dzdx = (hRight - hc) * nStr;
        const dzdy = (hDown - hc) * nStr;
        const invLen = 1 / Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
        const Nx = -dzdx * invLen;
        const Ny = -dzdy * invLen;
        const Nz = invLen;

        // Light 1
        let dot = Nx * L1x + Ny * L1y + Nz * L1z;
        const d1 = dot > 0 ? dot : 0;
        dot = Nx * H1x + Ny * H1y + Nz * H1z;
        const h1 = dot > 0 ? dot : 0;
        const sp1 = Math.pow(h1, shin) * specStr;

        // Light 2 (rim)
        dot = Nx * L2x + Ny * L2y + Nz * L2z;
        const d2 = dot > 0 ? dot : 0;
        dot = Nx * H2x + Ny * H2y + Nz * H2z;
        const h2 = dot > 0 ? dot : 0;
        const sp2 = Math.pow(h2, shin2) * specStr2;

        const totalDiff = d1 * diffStr + d2 * diffStr2;
        const totalSpec = sp1 + sp2;

        // Fresnel rim
        const f = 1 - Nz;
        const fresnel = f * f * 0.15;

        // Iridescent color
        const iRaw = hc * 0.3 + (Nx * 0.35 + Ny * 0.25) + t * 0.06 + 0.5;
        const iTw = ((iRaw % 1) + 1) % 1;
        const iIdx = iTw * (palLen - 1);
        const iLo = iIdx | 0;
        const iHi = iLo + 1 < palLen ? iLo + 1 : iLo;
        const iF = iIdx - iLo;
        const iS = iF * iF * (3 - 2 * iF);
        const cr = palR[iLo] + (palR[iHi] - palR[iLo]) * iS;
        const cg = palG[iLo] + (palG[iHi] - palG[iLo]) * iS;
        const cb = palB[iLo] + (palB[iHi] - palB[iLo]) * iS;

        // Compose
        const lit = ambient + totalDiff + fresnel;
        const dark = 1 - lit;
        let r = bgR * dark + cr * lit + 255 * totalSpec;
        let g = bgG * dark + cg * lit + 255 * totalSpec;
        let b = bgB * dark + cb * lit + 255 * totalSpec;

        const idx = (rowOff + px) << 2;
        data[idx]     = r > 255 ? 255 : r < 0 ? 0 : r;
        data[idx + 1] = g > 255 ? 255 : g < 0 ? 0 : g;
        data[idx + 2] = b > 255 ? 255 : b < 0 ? 0 : b;
        data[idx + 3] = 255;
      }
    }

    // Grain pass: apply noise to pixel data before uploading
    const grainAmt = opts.grain;
    if (grainAmt > 0) {
      const strength = grainAmt * 40; // map 0–1 to 0–40 intensity
      // Fast pseudo-random using frame time as seed variation
      let seed = (time * 1000) | 0;
      for (let i = 0; i < data.length; i += 4) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const noise = ((seed >> 16) / 32767 - 0.5) * strength;
        data[i]     += noise;
        data[i + 1] += noise;
        data[i + 2] += noise;
      }
    }

    offCtx.putImageData(imgData, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.globalAlpha = opts.opacity;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (opts.blur > 0) {
      ctx.filter = `blur(${opts.blur}px)`;
    }
    ctx.drawImage(offscreen!, 0, 0, ow, oh, 0, 0, width, height);
    ctx.filter = "none";
    ctx.restore();
  }

  return {
    mount(container: HTMLElement) {
      precompute();
      canvasHandle = createCanvas(container, () => drawFrame());

      if (opts.animated && !isMotionDisabled()) {
        loop = createLoop((dt) => {
          time += (dt / 1000) * opts.speed;
          drawFrame();
        });
        loop.start();
      } else {
        drawFrame();
      }

      if (opts.respectReducedMotion) {
        cleanupMotion = onReducedMotionChange((reduced) => {
          if (reduced) { loop?.stop(); drawFrame(); }
          else if (opts.animated) { loop?.start(); }
        });
      }
    },

    destroy() {
      loop?.stop();
      canvasHandle?.destroy();
      cleanupMotion?.();
      loop = null; canvasHandle = null; cleanupMotion = null;
      offscreen = null; offCtx = null; imgData = null; heightBuf = null;
    },

    resize() {
      offscreen = null; offCtx = null; imgData = null; heightBuf = null;
      drawFrame();
    },

    pause() { loop?.stop(); },

    resume() {
      if (opts.animated && !isMotionDisabled()) loop?.start();
    },

    update(newOpts: Partial<LiquidSilkOptions>) {
      opts = { ...opts, ...newOpts };
      precompute();
      drawFrame();
    },
  };
}
