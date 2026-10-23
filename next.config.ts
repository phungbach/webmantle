import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const FRAME_DENY = { key: "X-Frame-Options", value: "DENY" };

const isDev = process.env.NODE_ENV !== "production";

// No nonce: Next.js inline bootstrap scripts need 'unsafe-inline'. 'unsafe-eval' is development only.
const buildCsp = (frameAncestors: string) =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self'",
    `frame-ancestors ${frameAncestors}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Only when the site is served over https; on a plain-http host the browser would upgrade every asset URL.
    ...(isDev || !(process.env.SITE_URL ?? "").startsWith("https://")
      ? []
      : ["upgrade-insecure-requests"]),
  ].join("; ");
const csp = buildCsp("'none'");
// The page designer and the phone-size theme preview show a preview route in an iframe (same origin only).
const previewCsp = buildCsp("'self'");

const nextConfig: NextConfig = {
  // Prisma and the SQLite driver must stay out of the client bundle and run on Node.
  serverExternalPackages: ["@prisma/client", "prisma", "sanitize-html", "yauzl"],
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Theme ZIPs and media uploads are submitted through Server Actions.
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Everything refuses framing except the designer preview, which the admin embeds.
      { source: "/((?!design-preview|preview).*)", headers: [FRAME_DENY] },
      {
        source: "/design-preview/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: previewCsp },
        ],
      },
      {
        source: "/preview/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: previewCsp },
        ],
      },
      // /media and /theme-assets send their own, stricter CSP from the route handler; the global
      // one is not applied there so the two never conflict.
      {
        source: "/((?!media/|theme-assets/|design-preview|preview).*)",
        headers: [{ key: "Content-Security-Policy", value: csp }],
      },
    ];
  },
};

export default nextConfig;
