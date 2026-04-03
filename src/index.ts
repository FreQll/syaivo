// Core types
export type { BackgroundEffect, RenderContext } from "./core/types.js";

// Effects
export { createTopography } from "./effects/topography.js";
export type { TopographyOptions, TopographyEffect } from "./effects/topography.js";

export { createWaves } from "./effects/waves.js";
export type { WavesOptions, WavesEffect } from "./effects/waves.js";

export { createParticles } from "./effects/particles.js";
export type { ParticlesOptions, ParticlesEffect } from "./effects/particles.js";

export { createGlyphs } from "./effects/glyphs.js";
export type { GlyphsOptions, GlyphsEffect } from "./effects/glyphs.js";

export { createAurora } from "./effects/aurora.js";
export type { AuroraOptions, AuroraEffect } from "./effects/aurora.js";

export { createMeshGradient } from "./effects/mesh.js";
export type { MeshGradientOptions, MeshGradientEffect } from "./effects/mesh.js";

export { createDither } from "./effects/dither.js";
export type { DitherOptions, DitherEffect } from "./effects/dither.js";

export { createHyperJump } from "./effects/hyperJump.js";
export type { HyperJumpOptions, HyperJumpEffect } from "./effects/hyperJump.js";

export { createCyberGrid } from "./effects/cyberGrid.js";
export type { CyberGridOptions, CyberGridEffect } from "./effects/cyberGrid.js";

export { createDitherWarp } from "./effects/ditherWarp.js";
export type { DitherWarpOptions, DitherWarpEffect } from "./effects/ditherWarp.js";
export type { DitherWarpShape, DitherWarpPattern } from "./effects/ditherWarp.js";

export { createLumina } from "./effects/lumina.js";
export type { LuminaOptions, LuminaEffect } from "./effects/lumina.js";

export { createLiquidSilk } from "./effects/liquidSilk.js";
export type { LiquidSilkOptions, LiquidSilkEffect } from "./effects/liquidSilk.js";

export { createHalftone } from "./effects/halftone.js";
export type { HalftoneOptions, HalftoneEffect } from "./effects/halftone.js";

// Utilities
export { prefersReducedMotion } from "./core/reducedMotion.js";
export { simplex2, simplex3, fbm, fbm3 } from "./core/noise.js";
