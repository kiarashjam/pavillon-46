/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
    domains: [],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Fix constant reloading caused by OneDrive file sync
      config.watchOptions = {
        poll: 1000,           // Check for changes every 1s instead of using native fs events
        aggregateTimeout: 300, // Delay rebuild after the first change (ms)
        ignored: ['**/node_modules/**', '**/.next/**', '**/.git/**'],
      }
    }
    return config
  },
}

module.exports = nextConfig
