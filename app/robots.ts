import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const site = publicEnv.NEXT_PUBLIC_SITE_URL;
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private or per-user areas. Download URLs are signed, short-lived and never linked publicly.
      disallow: ["/admin", "/api/", "/auth/", "/*/account", "/*/cart", "/*/checkout", "/*/orders", "/*/wishlist"],
    },
    sitemap: `${site}/sitemap.xml`,
  };
}
