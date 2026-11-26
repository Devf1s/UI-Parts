import type { NextConfig } from "next";

/**
 * Security headers for every response. No script CSP: the static pages carry Next's inline
 * bootstrap scripts, which would need nonces (and dynamic rendering). The CSP here only sets the
 * directives that don't touch scripts: no framing, no plugins, no <base> or form hijacking. HSTS
 * comes from Vercel, which sends it on every HTTPS response.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // project screenshots carry a content hash in their names (scripts/capture-previews.mjs)
      { source: "/previews/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
