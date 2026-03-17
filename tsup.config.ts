import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: false,
    clean: true,
    treeshake: true,
    external: ["react", "react-dom"],
  },
  {
    entry: { react: "src/adapters/react.tsx" },
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: false,
    external: ["react", "react-dom"],
  },
]);
