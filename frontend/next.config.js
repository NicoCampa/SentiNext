/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

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

module.exports = nextConfig;
