/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Avoid bundling the shared package — let Next.js resolve it via Node.
    externalDir: true,
  },
  // The dashboard is reverse-proxied under /agents/ on menuboard.online.
  // We use `basePath` so the dev server and prod build both know about it.
  basePath: process.env.MC_DASHBOARD_BASE_PATH || "/agents",
  output: "standalone",
};

export default nextConfig;