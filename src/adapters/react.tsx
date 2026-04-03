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
import { createAurora, type AuroraOptions, type AuroraEffect } from "../effects/aurora.js";
import { createMeshGradient, type MeshGradientOptions, type MeshGradientEffect } from "../effects/mesh.js";
import { createDither, type DitherOptions, type DitherEffect } from "../effects/dither.js";
import { createHyperJump, type HyperJumpOptions, type HyperJumpEffect } from "../effects/hyperJump.js";
import { createCyberGrid, type CyberGridOptions, type CyberGridEffect } from "../effects/cyberGrid.js";
import { createDitherWarp, type DitherWarpOptions, type DitherWarpEffect } from "../effects/ditherWarp.js";
import { createLumina, type LuminaOptions, type LuminaEffect } from "../effects/lumina.js";
import { createHalftone, type HalftoneOptions, type HalftoneEffect } from "../effects/halftone.js";
import type { BackgroundEffect } from "../core/types.js";

// ---------------------------------------------------------------------------
// Shared hook
// ---------------------------------------------------------------------------

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const clean = {} as T;
  for (const key in obj) {
    if (obj[key] !== undefined) clean[key] = obj[key];
  }
  return clean;
}

function useBackgroundEffect<TEffect extends BackgroundEffect, TOpts>(
  factory: (opts: TOpts) => TEffect,
  options: TOpts,
  effectRef?: RefObject<TEffect | null>
): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  const optsRef = useRef(options);
  optsRef.current = stripUndefined(options as Record<string, unknown>) as TOpts;

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
    speed, filled, lineWidth, harmonics, animated, respectReducedMotion,
    ...divProps
  } = props;

  const opts: WavesOptions = {
    colors, backgroundColor, layers, amplitude, frequency,
    speed, filled, lineWidth, harmonics, animated, respectReducedMotion,
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

// ---------------------------------------------------------------------------
// <Aurora />
// ---------------------------------------------------------------------------

export interface AuroraProps extends AuroraOptions, DivProps {
  effectRef?: RefObject<AuroraEffect | null>;
}

export function Aurora({ style, effectRef, ...props }: AuroraProps) {
  const {
    colors, backgroundColor, curtains, waveAmplitude, curtainWidth,
    speed, opacity, scanlines, animated, respectReducedMotion,
    ...divProps
  } = props;

  const opts: AuroraOptions = {
    colors, backgroundColor, curtains, waveAmplitude, curtainWidth,
    speed, opacity, scanlines, animated, respectReducedMotion,
  };

  const ref = useBackgroundEffect(createAurora, opts, effectRef);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}

// ---------------------------------------------------------------------------
// <MeshGradient />
// ---------------------------------------------------------------------------

export interface MeshGradientProps extends MeshGradientOptions, DivProps {
  effectRef?: RefObject<MeshGradientEffect | null>;
}

export function MeshGradient({ style, effectRef, ...props }: MeshGradientProps) {
  const {
    colors, backgroundColor, points, distortion,
    speed, animated, respectReducedMotion,
    ...divProps
  } = props;

  const opts: MeshGradientOptions = {
    colors, backgroundColor, points, distortion,
    speed, animated, respectReducedMotion,
  };

  const ref = useBackgroundEffect(createMeshGradient, opts, effectRef);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}

// ---------------------------------------------------------------------------
// <Dither />
// ---------------------------------------------------------------------------

export interface DitherProps extends DitherOptions, DivProps {
  effectRef?: RefObject<DitherEffect | null>;
}

export function Dither({ style, effectRef, ...props }: DitherProps) {
  const {
    colors, backgroundColor, pixelSize, pattern, angle,
    noiseIntensity, speed, animated, respectReducedMotion,
    ...divProps
  } = props;

  const opts: DitherOptions = {
    colors, backgroundColor, pixelSize, pattern, angle,
    noiseIntensity, speed, animated, respectReducedMotion,
  };

  const ref = useBackgroundEffect(createDither, opts, effectRef);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}

// ---------------------------------------------------------------------------
// <HyperJump />
// ---------------------------------------------------------------------------

export interface HyperJumpProps extends HyperJumpOptions, DivProps {
  effectRef?: RefObject<HyperJumpEffect | null>;
}

export function HyperJump({ style, effectRef, ...props }: HyperJumpProps) {
  const {
    colors, backgroundColor, count, minSize, maxSize,
    speed, trailSegments, centerX, centerY, animated, respectReducedMotion,
    ...divProps
  } = props;

  const opts: HyperJumpOptions = {
    colors, backgroundColor, count, minSize, maxSize,
    speed, trailSegments, centerX, centerY, animated, respectReducedMotion,
  };

  const ref = useBackgroundEffect(createHyperJump, opts, effectRef);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}

// ---------------------------------------------------------------------------
// <CyberGrid />
// ---------------------------------------------------------------------------

export interface CyberGridProps extends CyberGridOptions, DivProps {
  effectRef?: RefObject<CyberGridEffect | null>;
}

export function CyberGrid({ style, effectRef, ...props }: CyberGridProps) {
  const {
    gridColor, backgroundColor, intensity, anchor, fov,
    speed, floorMode, lineWidth, pixelated, animated, respectReducedMotion,
    ...divProps
  } = props;

  const opts: CyberGridOptions = {
    gridColor, backgroundColor, intensity, anchor, fov,
    speed, floorMode, lineWidth, pixelated, animated, respectReducedMotion,
  };

  const ref = useBackgroundEffect(createCyberGrid, opts, effectRef);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}

// ---------------------------------------------------------------------------
// <DitherWarp />
// ---------------------------------------------------------------------------

export interface DitherWarpProps extends DitherWarpOptions, DivProps {
  effectRef?: RefObject<DitherWarpEffect | null>;
}

export function DitherWarp({ style, effectRef, ...props }: DitherWarpProps) {
  const {
    colorFront, colorBack, shape, pattern, pixelSize,
    scale, speed, animated, respectReducedMotion,
    ...divProps
  } = props;

  const opts: DitherWarpOptions = {
    colorFront, colorBack, shape, pattern, pixelSize,
    scale, speed, animated, respectReducedMotion,
  };

  const ref = useBackgroundEffect(createDitherWarp, opts, effectRef);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}

// ---------------------------------------------------------------------------
// <Lumina />
// ---------------------------------------------------------------------------

export interface LuminaProps extends LuminaOptions, DivProps {
  effectRef?: RefObject<LuminaEffect | null>;
}

export function Lumina({ style, effectRef, ...props }: LuminaProps) {
  const {
    backgroundColor, beamColor, beams, angle, intensity, softness,
    grain, grainSpeed, beamSpeed, speed, animated, respectReducedMotion,
    ...divProps
  } = props;

  const opts: LuminaOptions = {
    backgroundColor, beamColor, beams, angle, intensity, softness,
    grain, grainSpeed, beamSpeed, speed, animated, respectReducedMotion,
  };

  const ref = useBackgroundEffect(createLumina, opts, effectRef);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}

// ---------------------------------------------------------------------------
// <Halftone />
// ---------------------------------------------------------------------------

export interface HalftoneProps extends HalftoneOptions, DivProps {
  effectRef?: RefObject<HalftoneEffect | null>;
}

export function Halftone({ style, effectRef, ...props }: HalftoneProps) {
  const {
    dotColor, colors, backgroundColor, pixelSize,
    dotMin, dotMax, dotThreshold, contrast, invert,
    angle, noiseIntensity, opacity,
    animated, respectReducedMotion, speed,
    waveFrequency, waveAmplitude, waveSpeed, ribbonWidth, ribbonSoftness,
    ...divProps
  } = props;

  const opts: HalftoneOptions = {
    dotColor, colors, backgroundColor, pixelSize,
    dotMin, dotMax, dotThreshold, contrast, invert,
    angle, noiseIntensity, opacity,
    animated, respectReducedMotion, speed,
    waveFrequency, waveAmplitude, waveSpeed, ribbonWidth, ribbonSoftness,
  };

  const ref = useBackgroundEffect(createHalftone, opts, effectRef);
  return <div ref={ref} style={{ ...FILL_STYLE, ...style }} {...divProps} />;
}
