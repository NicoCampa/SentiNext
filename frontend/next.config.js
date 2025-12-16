/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Export static assets so Tauri can bundle them for mobile
  output: "export",
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
