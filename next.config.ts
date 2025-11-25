import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '',
        pathname: '**',
      },
    ],
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      // {"source": "/dash", "destination": process.env.NEXUS_HOST, locale: false},
      //       {"source": "/dash/:match*", "destination": `${process.env.NEXUS_HOST}/dash/:match*`, locale: false},
      //       {"source": "/:locale/dash", "destination": `${process.env.NEXUS_HOST}/:locale`, locale: false},
      //       {"source": "/:locale/dash/:match*", "destination": `${process.env.NEXUS_HOST}/:locale/dash/:match*`, locale: false},
      //       {"source": "/api/v1", "destination": `${process.env.NEXUS_HOST}/api/v1`},
      //       {"source": "/api/v1/:match*", "destination": `${process.env.NEXUS_HOST}/api/v1/:match*`},
      //       {"source": "/services", "destination": `${process.env.NEXUS_HOST}/dash/services`, locale: false},
      //       {"source": "/services/:match*", "destination": `${process.env.NEXUS_HOST}/dash/services/:match*`, locale: false},
      //       {"source": "/:locale/services", "destination": `${process.env.NEXUS_HOST}/:locale/dash/services`, locale: false},
      //       {"source": "/:locale/services/:match*", "destination": `${process.env.NEXUS_HOST}/:locale/dash/services/:match*`, locale: false},
      //       {"source": "/app", "destination": "https://alpha.dupip.com/"},
      //       {"source": "/app/:match*", "destination": "https://alpha.dupip.com/:match*"},
      {
        source: '/api/nexus/audio',
        destination: 'https://radio.dreampip.com/listen/dpipbase/live.mp3',
      },
    ]
  },
  async redirects() {
    return [
      {
        source: "/episodes",
        destination: "https://mixcloud.com/dupip",
        permanent: false,
      },
      { 
        source: "/code",
        destination: 'https://github.com/dupipcom',
        permanent: false,
      },
      { 
        source: "/app/mood",
        destination: '/app/day',
        permanent: false,
      },
      // New 302s to /app/do
      {
        source: "/app/day",
        destination: "/app/do",
        permanent: false,
      },
      {
        source: "/app/week",
        destination: "/app/do",
        permanent: false,
      },
      // Locale-prefixed variants
      {
        source: "/:locale/app/day",
        destination: "/:locale/app/do",
        permanent: false,
      },
      {
        source: "/:locale/app/week",
        destination: "/:locale/app/do",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
