/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";
const isDesktop = process.env.DESKTOP_BUILD === "1";

const nextConfig = {
  reactStrictMode: true,
  // Desktop: static export with unoptimized images
  ...(isDesktop && { output: 'export' }),
  images: isDesktop
    ? { unoptimized: true }
    : {
        remotePatterns: [
          {
            protocol: "https",
            hostname: "cdn.cloudflare.steamstatic.com",
          },
          {
            protocol: "https",
            hostname: "shared.akamai.steamstatic.com",
          },
        ],
      },
};

// Headers and rewrites are not supported with static export (desktop)
if (!isDesktop) {
  nextConfig.headers = async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "X-XSS-Protection", value: "0" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob: https://cdn.cloudflare.steamstatic.com https://shared.akamai.steamstatic.com",
            "connect-src 'self' " + (process.env.NEXT_PUBLIC_API_BASE_URL || ""),
            "frame-src 'self'",
          ].join("; "),
        },
      ],
    },
  ];

  // In dev mode, proxy /api/* requests to the backend
  if (isDev) {
    nextConfig.rewrites = async () => [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/:path*",
      },
    ];
  }
}

module.exports = nextConfig;
