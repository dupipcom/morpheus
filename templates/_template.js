'use client'
import React, { useEffect, useState, useContext } from 'react';
import Head from 'next/head';
import { Footer, Header } from '../components';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyle from '../scss/global';
import { generateTheme } from '../scss/theme'
import { AppContext } from '../context';
import { useRouter } from 'next/router';
import { Comfortaa } from 'next/font/google';
import dynamic from 'next/dynamic';
import { useFirstInteraction } from '../hooks/useFirstInteraction';
import Bugsnag from '@bugsnag/js';
import { Globals } from '@dreampipcom/oneiros';
import "@dreampipcom/oneiros/styles"

const GlowReact = dynamic(() =>
  import('../components/GlowReact').then((mod) => mod)
)

const comfortaa = Comfortaa({ subsets: ['latin'], display: 'swap' })

export const theme = generateTheme({ fontFamily: comfortaa.style.fontFamily })

export function Template({ children }) {
  const { locale: orig, query, pathname  } = useRouter()
  const locale = orig === "default" ? "en" : orig
  const [rootContext, setRootContext] = useState({ locale })
  const [rootAgenda, setRootAgenda] = useState({})
  const [rootCities, setRootCities] = useState([])
  const [loadGlow, setLoadGlow] = useState("")

  const whereami = pathname.split('/')[1] || "home";

  useEffect(() => {
    function getQueryVariable(variable) {
      try {
        var query = window.location.search.substring(1);
        var vars = query.split('&');
        for (var i = 0; i < vars.length; i++) {
          var pair = vars[i].split('=');
          if (decodeURIComponent(pair[0]) == variable) {
            return decodeURIComponent(pair[1]);
          }
        }
      } catch (e) {
        Bugsnag.notify(e)
      }
    }
    const mobileApp = getQueryVariable('mobileApp')
    const nextImage = getQueryVariable('nextImage')

    if (!rootContext?.setContext) {
      setRootContext({
        ...rootContext,
        whereami,
        slug: query.slug,
        setContext: setRootContext,
        agendaData: rootAgenda,
        agendaCities: rootCities,
        facetedAgenda: {},
        setAgendaData: setRootAgenda,
        setAgendaCities: setRootCities,
        mobileApp: !!mobileApp,
        nextImage: !!nextImage,
        consent: undefined,
        reconsent: undefined,
        episode: undefined
      })
    }
  }, []);

  useFirstInteraction(() => {
    setLoadGlow(true)
  }, [], [true], [loadGlow !== ""]);

  return (
    <div suppressHydrationWarning className={comfortaa.className}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </Head>
        <AppContext.Provider value={rootContext}>
          <ThemeProvider theme={theme} className="bg-">
              <GlobalStyle />
              <CssBaseline />
              <Globals theme="dark">
                {!rootContext.mobileApp && (<Header title="DreamPip" description="Fintech for compassion." />)}
                <main className={"thebigbody"} sx={{ minHeight: !!rootContext.mobileApp ? pathname === '/chat' ? 'calc(100vh - 64px)' : '100vh' : 'initial' }}>
                  {children}
                </main>
                <Footer />
                {loadGlow ? <GlowReact locale={locale} /> : undefined}
              </Globals>
          </ThemeProvider>
        </AppContext.Provider>
    </div >
  );
}
