import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/podcast/spotify/upload': ['./node_modules/@ffmpeg-installer/linux-x64/ffmpeg'],
    '/api/podcast/spotify/import-from-drive': ['./node_modules/@ffmpeg-installer/linux-x64/ffmpeg'],
  },
};

export default nextConfig;
