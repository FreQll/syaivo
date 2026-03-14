/**
 * React adapter for syaivo background effects.
 *
 * Thin lifecycle wrappers — zero animation logic lives here.
 * Each component mounts the core effect into a div ref and
 * tears it down cleanly on unmount.
 */
import { useEffect, useRef, type CSSProperties, type HTMLAttributes, type RefObject } from "react";
import { createTopography, type TopographyOptions, type TopographyEffect } from "../effects/topography.js";
import { createWaves, type WavesOptions, type WavesEffect } from "../effects/waves.js";
import { createParticles, type ParticlesOptions, type ParticlesEffect } from "../effects/particles.js";
import { createGlyphs, type GlyphsOptions, type GlyphsEffect } from "../effects/glyphs.js";
import type { BackgroundEffect } from "../core/types.js";

// ---------------------------------------------------------------------------
// Shared hook
// ---------------------------------------------------------------------------

function useBackgroundEffect<TEffect extends BackgroundEffect, TOpts>(
  factory: (opts: TOpts) => TEffect,
  options: TOpts,
  effectRef?: RefObject<TEffect | null>
): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const effect = factory(optsRef.current);
    effect.mount(el);
    if (effectRef) (effectRef as React.MutableRefObject<TEffect | null>).current = effect;
    return () => {
      effect.destroy();
      if (effectRef) (effectRef as React.MutableRefObject<TEffect | null>).current = null;
    };
    // We intentionally mount once — use effectRef.current.update() for live changes.
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

export interface TopographyProps extends TopographyOptions, DivProps {
  effectRef?: RefObject<TopographyEffect | null>;
}

export function Topography({ style, effectRef, ...props }: TopographyProps) {
  const {
    lineColor, backgroundColor, detail, levels, lineWidth,
    speed, animated, noiseScale, warpStrength, respectReducedMotion,
    ...divProps
  } = props;

  const opts: TopographyOptions = {
    lineColor, backgroundColor, detail, levels, lineWidth,
    speed, animated, noiseScale, warpStrength, respectReducedMotion,
  };

  const ref = useBackgroundEffect(createTopography, opts, effectRef);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}

// ---------------------------------------------------------------------------
// <Waves />
// ---------------------------------------------------------------------------

export interface WavesProps extends WavesOptions, DivProps {
  effectRef?: RefObject<WavesEffect | null>;
}

export function Waves({ style, effectRef, ...props }: WavesProps) {
  const {
    colors, backgroundColor, layers, amplitude, frequency,
    speed, filled, lineWidth, animated, respectReducedMotion,
    ...divProps
  } = props;

  const opts: WavesOptions = {
    colors, backgroundColor, layers, amplitude, frequency,
    speed, filled, lineWidth, animated, respectReducedMotion,
  };

  const ref = useBackgroundEffect(createWaves, opts, effectRef);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}

// ---------------------------------------------------------------------------
// <Particles />
// ---------------------------------------------------------------------------

export interface ParticlesProps extends ParticlesOptions, DivProps {
  effectRef?: RefObject<ParticlesEffect | null>;
}

export function Particles({ style, effectRef, ...props }: ParticlesProps) {
  const {
    color, backgroundColor, count, minRadius, maxRadius,
    maxSpeed, mouseInteraction, mouseRadius, animated, respectReducedMotion,
    ...divProps
  } = props;

  const opts: ParticlesOptions = {
    color, backgroundColor, count, minRadius, maxRadius,
    maxSpeed, mouseInteraction, mouseRadius, animated, respectReducedMotion,
  };

  const ref = useBackgroundEffect(createParticles, opts, effectRef);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}

// ---------------------------------------------------------------------------
// <Glyphs />
// ---------------------------------------------------------------------------

export interface GlyphsProps extends GlyphsOptions, DivProps {
  effectRef?: RefObject<GlyphsEffect | null>;
}

export function Glyphs({ style, effectRef, ...props }: GlyphsProps) {
  const {
    charset, color, backgroundColor, count, minSpeed, maxSpeed,
    minOpacity, maxOpacity, fontSize, fontFamily,
    minFlickerInterval, maxFlickerInterval, animated, respectReducedMotion,
    ...divProps
  } = props;

  const opts: GlyphsOptions = {
    charset, color, backgroundColor, count, minSpeed, maxSpeed,
    minOpacity, maxOpacity, fontSize, fontFamily,
    minFlickerInterval, maxFlickerInterval, animated, respectReducedMotion,
  };

  const ref = useBackgroundEffect(createGlyphs, opts, effectRef);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}

