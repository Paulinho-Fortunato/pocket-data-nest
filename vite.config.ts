// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
//
// `vite-tsconfig-paths` stays in package.json on purpose: the Lovable config above
// imports and registers that plugin unconditionally and declares it as a peer
// dependency, so removing it (in favour of Vite's native `resolve.tsconfigPaths`)
// would break the build. The alias itself is already resolved by the plugin.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    server: {
      // The dev server runs behind a sandbox proxy, so the preview origin is not
      // `localhost`. Allowing any host only affects `vite dev` (never the build).
      host: "0.0.0.0",
      allowedHosts: true,
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
