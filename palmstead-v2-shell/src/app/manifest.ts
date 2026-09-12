import type { MetadataRoute } from "next";

// Real user ask (2026-09-11): "redesign a png version transparent bg,
// and use it as the icon ... that when u install the system as an
// app, that will be the icon." No PWA manifest existed at all before
// this -- "install as an app" had nothing to source its icon from.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Palmstead",
    short_name: "Palmstead",
    description: "Palmstead staff portal — PEP Landbank",
    start_url: "/dashboard/default",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0B1E3D",
    icons: [
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
