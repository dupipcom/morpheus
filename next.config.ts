import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
      //       {"source": "/app", "destination": "https://alpha.dreampip.com/"},
      //       {"source": "/app/:match*", "destination": "https://alpha.dreampip.com/:match*"},
      {
        source: '/api/nexus/audio',
        destination: 'https://radio.dreampip.com/listen/dpip000/live.mp3',
      },
    ]
  },
  async redirects() {
    return [
      {
        source: "/episodes",
        destination: "https://mixcloud.com/dreampip",
        permanent: false,
      },
      { 
        source: "/login",
        destination: '/api/auth/signin',
        permanent: false,
      },
      { 
        source: "/logout",
        destination: '/api/auth/signout',
        permanent: false,
      }
    ];
  },
};

export default nextConfig;
