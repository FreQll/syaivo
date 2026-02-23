import { createCanvas } from "../core/canvas.js";
import { createLoop } from "../core/loop.js";
import { prefersReducedMotion, onReducedMotionChange } from "../core/reducedMotion.js";
import type { BackgroundEffect } from "../core/types.js";

export interface ParticlesOptions {
  /** Particle color or array of colors. Default: "rgba(255,255,255,0.6)" */
  color?: string | string[];
  /** Canvas background color. Default: "transparent" */
  backgroundColor?: string;
  /** Number of particles. Default: 80 */
  count?: number;
  /** Minimum particle radius in px. Default: 1 */
  minRadius?: number;
  /** Maximum particle radius in px. Default: 3 */
  maxRadius?: number;
  /** Maximum speed in px/s. Default: 30 */
  maxSpeed?: number;
  /** Enable mouse repulsion. Default: false */
  mouseInteraction?: boolean;
  /** Repulsion radius in px. Default: 100 */
  mouseRadius?: number;
  /** Enable animation. Default: true */
  animated?: boolean;
  /** Respect prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;
}

const DEFAULTS: Required<ParticlesOptions> = {
  color: "rgba(255,255,255,0.6)",
  backgroundColor: "transparent",
  count: 80,
  minRadius: 1,
  maxRadius: 3,
  maxSpeed: 30,
  mouseInteraction: false,
  mouseRadius: 100,
  animated: true,
  respectReducedMotion: true,
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  colorIdx: number;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export interface ParticlesEffect extends BackgroundEffect {
  update(options: Partial<ParticlesOptions>): void;
}

export function createParticles(options: ParticlesOptions = {}): ParticlesEffect {
  let opts = { ...DEFAULTS, ...options };

  let canvasHandle: ReturnType<typeof createCanvas> | null = null;
  let loop: ReturnType<typeof createLoop> | null = null;
  let cleanupMotion: (() => void) | null = null;
  let particles: Particle[] = [];
  let colors: string[];

  let mouseX = -9999;
  let mouseY = -9999;
  let container: HTMLElement | null = null;

  const onMouseMove = (e: MouseEvent): void => {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  };

  const onMouseLeave = (): void => {
    mouseX = -9999;
    mouseY = -9999;
  };

  function isMotionDisabled(): boolean {
    return opts.respectReducedMotion && prefersReducedMotion();
  }

  function buildParticles(w: number, h: number): Particle[] {
    return Array.from({ length: opts.count }, (_, i) => ({
      x: rand(0, w),
      y: rand(0, h),
      vx: rand(-opts.maxSpeed, opts.maxSpeed),
      vy: rand(-opts.maxSpeed, opts.maxSpeed),
      r: rand(opts.minRadius, opts.maxRadius),
      colorIdx: i % colors.length,
    }));
  }

  function updateParticles(dt: number): void {
    if (!canvasHandle) return;
    const { width, height } = canvasHandle;
    const dtS = dt / 1000;
    const mr2 = opts.mouseRadius * opts.mouseRadius;

    for (const p of particles) {
      if (opts.mouseInteraction) {
        const dx = p.x - mouseX;
        const dy = p.y - mouseY;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < mr2 && dist2 > 0) {
          const dist = Math.sqrt(dist2);
          const force = (1 - dist / opts.mouseRadius) * opts.maxSpeed * 2;
          p.vx += (dx / dist) * force * dtS;
          p.vy += (dy / dist) * force * dtS;
        }
        // Dampen to max speed
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > opts.maxSpeed) {
          const ratio = opts.maxSpeed / speed;
          p.vx *= ratio;
          p.vy *= ratio;
        }
      }

      p.x += p.vx * dtS;
      p.y += p.vy * dtS;

      // Wrap edges
      if (p.x < -p.r) p.x = width + p.r;
      else if (p.x > width + p.r) p.x = -p.r;
      if (p.y < -p.r) p.y = height + p.r;
      else if (p.y > height + p.r) p.y = -p.r;
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

    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = colors[p.colorIdx];
      ctx.fill();
    }
  }

  return {
    mount(el: HTMLElement) {
      container = el;
      colors = Array.isArray(opts.color) ? opts.color : [opts.color];

      canvasHandle = createCanvas(el, (w, h) => {
        // Rebuild particles on resize to fill new bounds
        particles = buildParticles(w, h);
        drawFrame();
      });

      particles = buildParticles(canvasHandle.width, canvasHandle.height);

      if (opts.mouseInteraction) {
        el.addEventListener("mousemove", onMouseMove, { passive: true });
        el.addEventListener("mouseleave", onMouseLeave);
      }

      const animated = opts.animated && !isMotionDisabled();

      if (animated) {
        loop = createLoop((deltaTime) => {
          updateParticles(deltaTime);
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
      if (container && opts.mouseInteraction) {
        container.removeEventListener("mousemove", onMouseMove);
        container.removeEventListener("mouseleave", onMouseLeave);
      }
      loop = null;
      canvasHandle = null;
      cleanupMotion = null;
      container = null;
    },

    resize(w: number, h: number) {
      particles = buildParticles(w, h);
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

    update(newOptions: Partial<ParticlesOptions>) {
      const prevCount = opts.count;
      opts = { ...opts, ...newOptions };
      colors = Array.isArray(opts.color) ? opts.color : [opts.color];
      // Rebuild particles if count changed
      if (newOptions.count !== undefined && newOptions.count !== prevCount && canvasHandle) {
        particles = buildParticles(canvasHandle.width, canvasHandle.height);
      }
      drawFrame();
    },
  };
}
