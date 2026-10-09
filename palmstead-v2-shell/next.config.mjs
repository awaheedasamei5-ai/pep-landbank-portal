import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Real fix for the "Compiling... freezes the tab" complaint: the React
  // Compiler's Babel transform runs on every file on every dev compile,
  // which is a production-only memoization win with zero dev benefit --
  // it was adding real overhead to the already-slow first-visit compile
  // of every route (several routes measured 2-11s cold in dev server
  // logs). Full per-route code-splitting of the heavier libs (exceljs,
  // jspdf, d3-geo/topojson, FullCalendar) is a separate, larger follow-on
  // -- this is the single highest-leverage lever available without
  // restructuring every page's imports.
  reactCompiler: process.env.NODE_ENV === "production",
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  experimental: {
    // Second lever for the same cold-compile problem: these are large
    // barrel-export packages (simple-icons alone is 3000+ icon modules,
    // radix-ui/@base-ui/react re-export dozens of primitives, recharts
    // and date-fns are both sizeable) that this app imports named
    // exports from all over the place. Without this, a route that
    // imports one icon from simple-icons can pull the whole package's
    // module graph into that route's dev compile.
    optimizePackageImports: [
      "lucide-react",
      "simple-icons",
      "radix-ui",
      "@base-ui/react",
      "recharts",
      "date-fns",
      "lodash-es",
    ],
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
      "@plane/utils": "./src/openplane/utils/index.ts",
      "@plane/hooks": "./src/openplane/hooks/index.ts",
      "@plane/i18n": "./src/openplane/i18n/index.ts",
      "@plane/shared-state": "./src/openplane/shared-state/index.ts",
      "@plane/services": "./src/openplane/services/index.ts",
      // apps/web's own real services/store/hooks/lib (its "@/..." imports,
      // rewritten to this prefix on copy since "@/" already means "./src/"
      // in this project) -- see src/openplane/web.
      "@openplane-web/*": "./src/openplane/web/*",
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
