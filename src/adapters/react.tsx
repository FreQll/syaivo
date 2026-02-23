/**
 * React adapter for syaivo background effects.
 *
 * Thin lifecycle wrappers — zero animation logic lives here.
 * Each component mounts the core effect into a div ref and
 * tears it down cleanly on unmount.
 */
import { useEffect, useRef, type CSSProperties, type HTMLAttributes } from "react";
import { createTopography, type TopographyOptions } from "../effects/topography.js";
import { createWaves, type WavesOptions } from "../effects/waves.js";
import { createParticles, type ParticlesOptions } from "../effects/particles.js";
import type { BackgroundEffect } from "../core/types.js";

// ---------------------------------------------------------------------------
// Shared hook
// ---------------------------------------------------------------------------

function useBackgroundEffect<T>(
  factory: (opts: T) => BackgroundEffect,
  options: T
): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  // Serialize options for stable effect dependency
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const effect = factory(optsRef.current);
    effect.mount(el);
    return () => effect.destroy();
    // We intentionally mount once — options changes are not live-patched.
    // Recreate the component to change options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref as React.RefObject<HTMLDivElement>;
}

// ---------------------------------------------------------------------------
// Wrapper div style — fills its parent
// ---------------------------------------------------------------------------

const FILL_STYLE: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
};

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "color">;

// ---------------------------------------------------------------------------
// <Topography />
// ---------------------------------------------------------------------------

export interface TopographyProps extends TopographyOptions, DivProps {}

export function Topography({ style, ...props }: TopographyProps) {
  const {
    lineColor, backgroundColor, detail, levels, lineWidth,
    speed, animated, noiseScale, respectReducedMotion,
    ...divProps
  } = props;

  const opts: TopographyOptions = {
    lineColor, backgroundColor, detail, levels, lineWidth,
    speed, animated, noiseScale, respectReducedMotion,
  };

  const ref = useBackgroundEffect(createTopography, opts);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}

// ---------------------------------------------------------------------------
// <Waves />
// ---------------------------------------------------------------------------

export interface WavesProps extends WavesOptions, DivProps {}

export function Waves({ style, ...props }: WavesProps) {
  const {
    colors, backgroundColor, layers, amplitude, frequency,
    speed, filled, lineWidth, animated, respectReducedMotion,
    ...divProps
  } = props;

  const opts: WavesOptions = {
    colors, backgroundColor, layers, amplitude, frequency,
    speed, filled, lineWidth, animated, respectReducedMotion,
  };

  const ref = useBackgroundEffect(createWaves, opts);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}

// ---------------------------------------------------------------------------
// <Particles />
// ---------------------------------------------------------------------------

export interface ParticlesProps extends ParticlesOptions, DivProps {}

export function Particles({ style, ...props }: ParticlesProps) {
  const {
    color, backgroundColor, count, minRadius, maxRadius,
    maxSpeed, mouseInteraction, mouseRadius, animated, respectReducedMotion,
    ...divProps
  } = props;

  const opts: ParticlesOptions = {
    color, backgroundColor, count, minRadius, maxRadius,
    maxSpeed, mouseInteraction, mouseRadius, animated, respectReducedMotion,
  };

  const ref = useBackgroundEffect(createParticles, opts);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}
