/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [{ source: "/", destination: "/login", permanent: false }];
  },
  async rewrites() {
    const api = process.env.SUPABASE_INTERNAL_URL || "http://127.0.0.1:54321";
    return [
      { source: "/auth/:path*", destination: `${api}/auth/:path*` },
      { source: "/rest/:path*", destination: `${api}/rest/:path*` },
      { source: "/storage/:path*", destination: `${api}/storage/:path*` },
      { source: "/realtime/:path*", destination: `${api}/realtime/:path*` },
    ];
  },
};

module.exports = nextConfig;
