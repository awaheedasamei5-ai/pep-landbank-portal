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
    resolveAlias: {
      "react-router": "./src/webnext-shim/react-router.tsx",
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
