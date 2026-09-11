import type { ReactNode } from "react";

import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_CONFIG } from "@/config/app-config";
import { fontVars } from "@/lib/fonts/registry";
import { QueryProvider } from "@/lib/palmstead/query-provider";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { ThemeBootScript } from "@/scripts/theme-boot";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";

import "./globals.css";
// Real web-next design tokens (Palmstead Design Language, Phase 11) --
// every copied Sales-desk CSS Module (src/webnext/) was built against
// these var(--c-*) names. Scoped to .webnext-theme (see dashboard/
// layout.tsx) rather than :root/body, so it doesn't reskin the rest of
// this shell's own Tailwind/shadcn chrome (sidebar, Home dashboard).
import "@/webnext/shared/styles/tokens.css";

export const metadata: Metadata = {
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { theme_mode, theme_preset, content_layout, navbar_style, sidebar_variant, sidebar_collapsible, font } =
    PREFERENCE_DEFAULTS;
  return (
    <html
      lang="en"
      data-theme-mode={theme_mode}
      data-theme-preset={theme_preset}
      data-content-layout={content_layout}
      data-navbar-style={navbar_style}
      data-sidebar-variant={sidebar_variant}
      data-sidebar-collapsible={sidebar_collapsible}
      data-font={font}
      suppressHydrationWarning
    >
      <head>
        {/* Real Palmstead/Trulander favicon (same files web-next serves) --
            overrides the template's default src/app/favicon.ico, which
            Next.js otherwise auto-serves at a higher priority than a
            public/favicon.ico of the same name. */}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* Real web-next webfonts (Bricolage Grotesque/Plus Jakarta Sans/
            IBM Plex Mono) -- previously only linked in web-next's own
            index.html <head>, which this shell doesn't have. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
        {/* Applies theme and layout preferences on load to avoid flicker and unnecessary server rerenders. */}
        <ThemeBootScript />
      </head>
      <body className={`${fontVars} min-h-screen antialiased`}>
        <QueryProvider>
          <TooltipProvider>
            <PreferencesStoreProvider initialValues={PREFERENCE_DEFAULTS}>
              {children}
              <Toaster />
            </PreferencesStoreProvider>
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
