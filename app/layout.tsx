import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/noto-sans-sc/wght.css";
import { PwaRegistration } from "@/components/PwaRegistration";
import { appBasePathRequestBootstrap, withAppBasePath } from "@/lib/app-base-path";
import { isRuoyiIntegrationEnabled } from "@/lib/ruoyi-identity";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./settings.css";
import "./sidebar.css";
import "./sidebar-menu.css";

const isRuoyiIntegration = isRuoyiIntegrationEnabled();
const applicationName = isRuoyiIntegration ? "Web Agent" : "Pi Web";
const applicationIcon = isRuoyiIntegration ? "/icons/web-agent-logo.svg" : "/icons/icon-192.png";

export const metadata: Metadata = {
  title: applicationName,
  description: isRuoyiIntegration ? "Web Agent" : "Pi Web interface for the pi coding agent",
  applicationName,
  manifest: withAppBasePath("/manifest.webmanifest"),
  icons: {
    icon: [
      {
        url: withAppBasePath(applicationIcon),
        type: isRuoyiIntegration ? "image/svg+xml" : "image/png",
      },
    ],
    apple: [
      {
        url: withAppBasePath("/icons/apple-touch-icon.png"),
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: applicationName,
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a1a" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" translate="no" className="notranslate" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_INIT_SCRIPT,
          }}
        />
      </head>
      <body translate="no" className="notranslate" suppressHydrationWarning>
        <Script id="pi-web-base-path-fetch" strategy="beforeInteractive">
          {appBasePathRequestBootstrap()}
        </Script>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
