/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
  
  // Explicitly expose public environment variables
  env: {
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  },
  
  // Implement proper caching
  async headers() {
    return [
      {
        source: '/:all*(svg|jpg|png)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/api/quran',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=60',
          },
        ],
      },
    ];
  },
  
  // Implement proper code splitting
  experimental: {
    optimizeCss: true,
    scrollRestoration: true,
    workerThreads: true,
    cpus: 4,
  },
  
  // Implement proper image optimization
  images: {
    domains: ['your-image-domain.com'],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  // Optimize bundle size
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          minSize: 20000,
          maxSize: 244000,
          minChunks: 1,
          maxAsyncRequests: 30,
          maxInitialRequests: 30,
          cacheGroups: {
            defaultVendors: {
              test: /[\\/]node_modules[\\/]/,
              priority: -10,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }

    // Ensure proper URL implementation in the browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        url: require.resolve('url'),
      };
    }

    // Add polyfills for socket.io-client
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        dns: false,
        bufferutil: require.resolve('bufferutil'),
        'utf-8-validate': require.resolve('utf-8-validate'),
      };
    }

    return config;
  },
}

module.exports = nextConfig
