/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    unoptimized: true,
  },
};

if (!isDev) {
  // Export static assets so Tauri can bundle them for desktop builds.
  nextConfig.output = "export";
}

module.exports = nextConfig;
