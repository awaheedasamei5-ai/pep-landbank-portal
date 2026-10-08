import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  // Real web-next Sales-desk screens/hooks (src/webnext/) are copied in
  // verbatim and import from the 'react-router' package unedited -- this
  // aliases that import to a local routing adapter backed by Next's own
  // App Router (src/webnext-shim/react-router.tsx) instead of installing
  // react-router itself, which would fight Next's own router.
  turbopack: {
    // Fixed 2026-10-08: a package-lock.json landed at the monorepo root
    // (unrelated tooling installed there in a different session) gave
    // Turbopack two lockfiles to choose a workspace root from -- it picked
    // the wrong one, which started breaking real module resolution (Google
    // Fonts, preferences-store imports), not just the cosmetic warning this
    // was previously filed as. Pinning root explicitly removes the ambiguity.
    root: __dirname,
    resolveAlias: {
      "react-router": "./src/webnext-shim/react-router.tsx",
      // Operations Tracker (src/openplane/) is a literal duplicate of
      // makeplane/plane's real pnpm workspace packages (@plane/types,
      // @plane/constants, ...), copied in with their own internal
      // "@plane/xxx" imports unedited -- same aliasing approach as
      // react-router above, pointed at the copied folders instead of a
      // real separate package.
      "@plane/types": "./src/openplane/types/index.ts",
      "@plane/constants": "./src/openplane/constants/index.ts",
    },
  },
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/default",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
