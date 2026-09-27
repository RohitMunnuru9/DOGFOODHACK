const apiOrigin = process.env.DOGFOOD_API_ORIGIN || 'http://127.0.0.1:8000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.DOGFOOD_NEXT_DIST || '.next',
  output: 'standalone',
  devIndicators: false,
  async rewrites() {
    return [
      {source: '/health', destination: `${apiOrigin}/health`},
      {source: '/assets/site.css', destination: `${apiOrigin}/assets/site.css`},
      {source: '/assets/clay-public.js', destination: `${apiOrigin}/assets/clay-public.js`},
      {source: '/events/:path*', destination: `${apiOrigin}/events/:path*`},
      {source: '/projects/:path*', destination: `${apiOrigin}/projects/:path*`},
      {source: '/embed/:path*', destination: `${apiOrigin}/embed/:path*`},
      {source: '/verify/:path*', destination: `${apiOrigin}/verify/:path*`},
      {source: '/certificates/:path*', destination: `${apiOrigin}/certificates/:path*`},
      {source: '/role-invite/:path*', destination: `${apiOrigin}/role-invite/:path*`},
      {source: '/vote-invite/:path*', destination: `${apiOrigin}/vote-invite/:path*`},
      {source: '/join/:path*', destination: `${apiOrigin}/join/:path*`},
      {source: '/media/:path*', destination: `${apiOrigin}/media/:path*`},
    ];
  },
};

export default nextConfig;
