// import { LOCALES } from "./lib/cjs-constants.js"

const config = {
    async headers() {
        return [
            {
                source: '/',
                headers: [
                  {
                    key: 'X-Dream-Vibe',
                    value: '...Pip!',
                  },
                ],
            },
            {
                source: '/:path',
                headers: [
                  {
                    key: 'X-Dream-Vibe',
                    value: '...Pip!',
                  },
                ],
            },
            {
                source: '/api/nexus/audio',
                headers: [
                  {
                    key: 'Referrer-Policy',
                    value: 'unsafe-url',
                  },
                ],
            },
            {
                source: '/api/nexus/audio/:path',
                headers: [
                  {
                    key: 'Referrer-Policy',
                    value: 'unsafe-url',
                  },
                ],
            },
        ]
    },
    transpilePackages: ['@mui/x-date-pickers', '/@mui/x-date-pickers-pro'],
    modularizeImports: {
        'lodash': {
            transform: 'lodash/dist/{{member}}',
        },
        // to-do barrel folders
        // '@dreampipcom/oneiros/atoms': {
        //     transform: '@dreampipcom/oneiros/dist/src/atoms/{{member}}',
        // },
        // '@dreampipcom/oneiros/molecules': {
        //     transform: '@dreampipcom/oneiros/dist/src/molecules/{{member}}',
        // },
    },
    productionBrowserSourceMaps: false,
    i18n: {
        locales: ["en", "pt-br", "it-it", "de-de", "fr-fr", "es-es", "ro", "pl-pl", "cs-cz", "sv-se", "et-ee", "ja-jp", "ru-ru", "default"],
        defaultLocale: "default",
        localeDetection: true,
    },
    images: {
        domains: ['images.contentful.com', 'images.ctfassets.net'],
        formats: ['image/webp'],
    },
    compiler: {
        styledComponents: true
    },
    assetPrefix: (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production'
      ? `https://${process.env.VERCEL_URL}`
      : process.env.MAIN_URL) || 'https://www.dreampip.com',
    async redirects() {
        return [
            {
                source: '/una',
                destination: 'https://www.notion.so/angeloreale/UNA-United-Natural-Altruists-6246fddb819d4bf28240a6016c613f45?pvs=4',
                permanent: false
            },
            {
                source: '/join',
                destination: '/dash/signin',
                permanent: false
            },
            {
                source: '/subscribe',
                destination: '/dash/signin',
                permanent: false
            },
            {
                source: '/dash',
                destination: '/dash/signin',
                permanent: false
            },
            {
                source: '/members',
                destination: '/dash/signin',
                permanent: false                
            },
            {
                source: '/members/notion',
                destination: 'https://www.notion.so/angeloreale/3ce9a1caba1e4f928b88ada939c73d02?pvs=4',
                permanent: false              
            },
            {
                source: '/members/calendar',
                destination: 'http://calendar.workspace.dreampip.com',
                permanent: false                
            },
            {
                source: '/members/chat',
                destination: 'https://dreampip.slack.com',
                permanent: false                
            },
            {
                source: '/members/mail',
                destination: 'http://mail.workspace.dreampip.com',
                permanent: false                
            },
            {
                source: '/members/storage',
                destination: 'http://storage.workspace.dreampip.com',
                permanent: false                
            },
            {
                source: '/home',
                destination: '/',
                permanent: true,
            },
            {
                source: '/chat',
                destination: '/subscribe',
                permanent: false,
            },
            {
                source: '/event/purizu-presents-abrakadabra-with-alabastro-mapa-splinter-dakaza-reale',
                destination: '/event/purizu-presents-abrakadabra-with-mapa-splinter-reale',
                permanent: false,
            },
            {
                source: '/event/purizu-presents-abrakadabra-with-alabastro-mapa-splinter-reale',
                destination: '/event/purizu-presents-abrakadabra-with-mapa-splinter-reale',
                permanent: false,
            },
            {
                source: '/episode/re-flight-dubem-at-karuna-sessions-160-l-2022-10-25',
                destination: '/episode/re-flight-dubem-at-karuna-sessions-161-l-2022-10-25',
                permanent: true,
            },
        ]
    },
    async rewrites() {
        return [
            {"source": "/dash", "destination": process.env.NEXUS_HOST, locale: false},
            {"source": "/dash/:match*", "destination": `${process.env.NEXUS_HOST}/dash/:match*`, locale: false},
            {"source": "/:locale/dash", "destination": `${process.env.NEXUS_HOST}/:locale`, locale: false},
            {"source": "/:locale/dash/:match*", "destination": `${process.env.NEXUS_HOST}/:locale/dash/:match*`, locale: false},
            {"source": "/api/v1", "destination": `${process.env.NEXUS_HOST}/api/v1`},
            {"source": "/api/v1/:match*", "destination": `${process.env.NEXUS_HOST}/api/v1/:match*`},
            {"source": "/services", "destination": `${process.env.NEXUS_HOST}/dash/services`, locale: false},
            {"source": "/services/:match*", "destination": `${process.env.NEXUS_HOST}/dash/services/:match*`, locale: false},
            {"source": "/:locale/services", "destination": `${process.env.NEXUS_HOST}/:locale/dash/services`, locale: false},
            {"source": "/:locale/services/:match*", "destination": `${process.env.NEXUS_HOST}/:locale/dash/services/:match*`, locale: false},
            {"source": "/app", "destination": "https://alpha.dreampip.com/"},
            {"source": "/app/:match*", "destination": "https://alpha.dreampip.com/:match*"},
            {"source": "/cloud", "destination": "https://zelta.dreampip.com/cloud"},
            {"source": "/cloud/:match*", "destination": "https://zelta.dreampip.com/cloud/:match*"},
            {
                source: '/api/nexus/audio/0',
                destination: 'http://207.246.121.205/0',
            },            
            {
                source: '/api/nexus/audio/1',
                destination: 'http://207.246.121.205/1',
            },
        ]
    }
}

export default config
