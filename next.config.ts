import {withSentryConfig} from "@sentry/nextjs";
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
        source: "/code",
        destination: 'https://github.com/dreampipcom',
        permanent: false,
      },
      { 
        source: "/app/mood",
        destination: '/app/day',
        permanent: false,
      }
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "dreampip",

  project: "morpheus",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});