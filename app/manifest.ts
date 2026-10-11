import type { MetadataRoute } from "next";
import { appBasePath, withAppBasePath } from "@/lib/app-base-path";

export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  const appName = process.env.PI_WEB_APP_NAME?.trim() || "Pi Web";
  return {
    id: appBasePath || "/",
    name: appName,
    short_name: appName,
    description: "Local web interface for the pi coding agent",
    start_url: withAppBasePath("/"),
    scope: withAppBasePath("/"),
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1a1a1a",
    categories: ["developer", "productivity"],
    lang: "en",
    icons: [
      {
        src: withAppBasePath("/icons/icon-192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withAppBasePath("/icons/icon-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
