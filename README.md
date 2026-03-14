# syaivo ✨

Animated background effects for modern Web Apps. Zero dependencies. Framework-agnostic core with first-class React bindings.

> **Alpha** — API may change between minor versions.

## Effects

| Effect         | Description                                          |
| -------------- | ---------------------------------------------------- |
| **Particles**  | Floating dots with edge wrapping and mouse repulsion |
| **Waves**      | Layered sine-wave ribbons with fill or stroke modes  |
| **Topography** | Animated contour-map lines driven by simplex noise   |
| **Glyphs**     | Ambient drifting characters that flicker and fade    |

## Install

```bash
npm install syaivo
```

## Quick start

### Vanilla

```ts
import { createParticles } from "syaivo";

const effect = createParticles({
  color: "#a5f3fc",
  count: 120,
  mouseInteraction: true,
});

effect.mount(document.getElementById("hero")!);

// Later:
effect.update({ count: 200 });
effect.destroy();
```

### React

```tsx
import { Particles } from "syaivo/react";

export default function Hero() {
  return (
    <div style={{ position: "relative", height: "100vh" }}>
      <Particles
        color="#a5f3fc"
        count={120}
        mouseInteraction
        style={{ position: "absolute", inset: 0 }}
      />
    </div>
  );
}
```

All four effects follow the same pattern — `createWaves`, `createTopography`, `createGlyphs` for vanilla, and `<Waves />`, `<Topography />`, `<Glyphs />` for React.

## API

Every effect implements the `BackgroundEffect` interface:

```ts
interface BackgroundEffect {
  mount(container: HTMLElement): void;
  destroy(): void;
  resize(width: number, height: number): void;
  pause(): void;
  resume(): void;
}
```

Each effect also exposes an `update(options)` method for live parameter changes without remounting.

### Accessibility

All effects respect `prefers-reduced-motion` by default. Disable with `respectReducedMotion: false`.

## Utilities

The library exposes noise functions used internally, available for custom effects:

```ts
import { simplex2, simplex3, fbm, fbm3 } from "syaivo";
```

## License

MIT
