import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

// Product preview images on Cloudflare R2 (see lib/storage/r2), when configured.
const previewImageUrl = process.env.NEXT_PUBLIC_PREVIEW_IMAGE_URL ? new URL(process.env.NEXT_PUBLIC_PREVIEW_IMAGE_URL) : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...(supabaseHost
        ? [{ protocol: "https" as const, hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
        : []),
      ...(previewImageUrl
        ? [{ protocol: "https" as const, hostname: previewImageUrl.hostname, pathname: `${previewImageUrl.pathname.replace(/\/+$/, "")}/**` }]
        : []),
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
