
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,
  // Add appropriate polyfills
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Ensure proper URL implementation in the browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        url: require.resolve('url/'),
      };
    }
    return config;
  },
}

module.exports = nextConfig
