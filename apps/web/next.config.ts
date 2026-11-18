import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  devIndicators: process.env.NEXT_DIST_DIR === '.next-overview' ? false : undefined,
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: '/assessments/media/:id',
        destination:
          (process.env.API_INTERNAL_ORIGIN ?? 'http://127.0.0.1:3101') + '/assessments/media/:id',
      },
      {
        source: '/api/:path*',
        destination: (process.env.API_INTERNAL_ORIGIN ?? 'http://127.0.0.1:3101') + '/:path*',
      },
    ];
  },
};
export default config;
