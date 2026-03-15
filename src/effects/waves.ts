import { createCanvas } from "../core/canvas.js";
import { createLoop } from "../core/loop.js";
import { prefersReducedMotion, onReducedMotionChange } from "../core/reducedMotion.js";
import type { BackgroundEffect } from "../core/types.js";

export interface WavesOptions {
  /** Wave line / fill color array. Defaults to 3 blue-ish tones. */
  colors?: string[];
  /** Canvas background. Default: "transparent" */
  backgroundColor?: string;
  /** Number of wave layers. Default: 3 */
  layers?: number;
  /** Wave amplitude as a fraction of canvas height. Default: 0.08 */
  amplitude?: number;
  /** Base frequency (cycles per canvas width). Default: 1.5 */
  frequency?: number;
  /** Animation speed multiplier. Default: 1 */
  speed?: number;
  /** Fill waves instead of stroking them. Default: true */
  filled?: boolean;
  /** Stroke line width (only used when filled=false). Default: 2 */
  lineWidth?: number;
  /** Enable animation. Default: true */
  animated?: boolean;
  /** Add extra harmonics to break wave symmetry. Default: false */
  harmonics?: boolean;
  /** Respect prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;
}

const DEFAULTS: Required<WavesOptions> = {
  colors: [
    "rgba(99,102,241,0.35)",
    "rgba(139,92,246,0.25)",
    "rgba(59,130,246,0.20)",
  ],
  backgroundColor: "transparent",
  layers: 3,
  amplitude: 0.08,
  frequency: 1.5,
  speed: 1,
  filled: true,
  lineWidth: 2,
  harmonics: false,
  animated: true,
  respectReducedMotion: true,
};

interface WaveHarmonic {
  freqMult: number;
  ampMult: number;
  phaseMult: number;
}

interface WaveLayer {
  phase: number;
  /** Vertical offset as fraction of height (0–1). */
  yOffset: number;
  /** Per-layer frequency multiplier. */
  freqMult: number;
  /** Per-layer speed multiplier. */
  speedMult: number;
  /** Per-layer amplitude multiplier. */
  ampMult: number;
  /** Extra harmonics to break symmetry. */
  harmonics: WaveHarmonic[];
}

export interface WavesEffect extends BackgroundEffect {
  update(options: Partial<WavesOptions>): void;
}

export function createWaves(options: WavesOptions = {}): WavesEffect {
  let opts = { ...DEFAULTS, ...options };

  let canvasHandle: ReturnType<typeof createCanvas> | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let cleanupMotion: (() => void) | null = null;
  let layers: WaveLayer[] = [];

  function buildLayers(count: number): WaveLayer[] {
    return Array.from({ length: count }, (_, i) => ({
      phase: (i / count) * Math.PI * 2,
      yOffset: 0.35 + (i / Math.max(count - 1, 1)) * 0.3,
      freqMult: 1 + i * 0.3,
      speedMult: 1 - i * 0.15,
      ampMult: 1 - i * 0.2,
      harmonics: opts.harmonics
        ? [
            { freqMult: 2.1 + i * 0.4, ampMult: 0.3, phaseMult: 1.3 + i * 0.2 },
            { freqMult: 3.7 + i * 0.6, ampMult: 0.12, phaseMult: 0.7 + i * 0.3 },
          ]
        : [],
    }));
  }

  function isMotionDisabled(): boolean {
    return opts.respectReducedMotion && prefersReducedMotion();
  }

  function drawFrame(): void {
    if (!canvasHandle) return;
    const { ctx, width, height } = canvasHandle;

    ctx.clearRect(0, 0, width, height);

    if (opts.backgroundColor !== "transparent") {
      ctx.fillStyle = opts.backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    const colors = opts.colors;
    const layerCount = Math.min(layers.length, colors.length);

    for (let i = layerCount - 1; i >= 0; i--) {
      const lyr = layers[i];
      const color = colors[i % colors.length];
      const baseY = height * lyr.yOffset;
      const amp = height * opts.amplitude * lyr.ampMult;
      const freq = (opts.frequency * lyr.freqMult * Math.PI * 2) / width;

      ctx.beginPath();
      ctx.moveTo(0, height);

      for (let x = 0; x <= width; x += 2) {
        let y = baseY + Math.sin(x * freq + lyr.phase) * amp;
        for (const h of lyr.harmonics) {
          y += Math.sin(x * freq * h.freqMult + lyr.phase * h.phaseMult) * amp * h.ampMult;
        }
        ctx.lineTo(x, y);
      }

      if (opts.filled) {
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = opts.lineWidth;
        ctx.stroke();
      }
    }
  }

  return {
    mount(container: HTMLElement) {
      layers = buildLayers(opts.layers);

      canvasHandle = createCanvas(container, () => {
        drawFrame();
      });

      const animated = opts.animated && !isMotionDisabled();

      if (animated) {
        loop = createLoop((deltaTime) => {
          const dt = deltaTime / 1000;
          for (const lyr of layers) {
            lyr.phase += dt * opts.speed * lyr.speedMult * 0.8;
          }
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

    update(newOptions: Partial<WavesOptions>) {
      const prevLayers = opts.layers;
      opts = { ...opts, ...newOptions };
      // Rebuild layer array only if count changed
      if (newOptions.layers !== undefined && newOptions.layers !== prevLayers) {
        layers = buildLayers(opts.layers);
      }
      drawFrame();
    },
  };
}
