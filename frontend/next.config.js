/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";
const shouldExport = (process.env.SENTINEXT_STATIC_EXPORT || "").trim().toLowerCase();

const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
};

// In dev mode, proxy /api/* requests to the backend
if (isDev) {
  nextConfig.rewrites = async () => {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/:path*",
      },
    ];
  };
}

if (!isDev && ["1", "true", "yes"].includes(shouldExport)) {
  // Export static assets so Tauri can bundle them for desktop builds.
  nextConfig.output = "export";
}

module.exports = nextConfig;
