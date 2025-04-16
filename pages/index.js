import { useContext, useEffect, useState } from 'react';
import { Hero, Posts } from '../components';
import Head from 'next/head'
import { AppContext } from '../context';
import Link from 'next/link';
import { getHeros, getHomeEpisodes, getHomePosts } from '../lib/api';
import { Template } from '../templates';
import { useRouter } from 'next/router';
import { localizeUrl } from '../lib/helpers';
import { ShowGrid } from '../components/ShowGrid';
import { HomeLocale } from '../locale/home';
import ReactPlayer from 'react-player';
import { addPlaceholders } from '../lib/server-helpers';
import Bugsnag from '@bugsnag/js';
import { Button } from '@dreampipcom/oneiros';

const DEFAULT = {
  title: 'DreamPip — Fintech for compassion. 📡',
  description: `DreamPip plex the experience of happiness, investing crowdfunding and charity, connecting individuals and communities across the globe, in transactions that thrive to fulfil in nothing but happiness, by means of healthy competition.`
}

// Translation
const IT = {
  title: 'DreamPip — Fintech for compassion. 📡',
  description: `DreamPip amplifica l’esperienza della felicità, investendo in crowdfunding e beneficenza, connettendo individui e comunità di tutto il mondo, in transazioni che mirano a soddisfare solo la felicità, attraverso una sana competizione.`
}

const PT = {
  title: 'DreamPip — Fintech for compassion. 📡',
  description: `DreamPip amplifica a experiência da felicidade, investindo em crowdfunding e caridade, conectando indivíduos e comunidades ao redor do mundo, em transações que buscam nada além da felicidade, por meio de uma competição saudável.`
}

const ES = {
  title: 'DreamPip — Fintech for compassion. 📡',
  description: `DreamPip amplifica la experiencia de la felicidad, invirtiendo en crowdfunding y caridad, conectando individuos y comunidades en todo el mundo, en transacciones que buscan cumplir solo con la felicidad, a través de una competencia sana.`
}

const DE = {
  title: 'DreamPip — Fintech for compassion. 📡',
  description: `DreamPip verstärkt das Glückserlebnis, investiert in Crowdfunding und Wohltätigkeit und verbindet Menschen und Gemeinschaften auf der ganzen Welt in Transaktionen, die dazu dienen, ausschließlich Glück zu erfüllen, durch gesunden Wettbewerb.`
}

const FR = {
  title: 'DreamPip — Fintech for compassion. 📡',
  description: `DreamPip amplifie l’expérience du bonheur, investit dans le crowdfunding et la charité, connectant les individus et les communautés à travers le monde, dans des transactions qui s’efforcent de n’accomplir que le bonheur, au moyen d’une compétition saine.`
}

const RO = {
  title: 'DreamPip — Fintech for compassion. 📡',
  description: `DreamPip amplifică experiența fericirii, investind în finanțare participativă și caritate, conectând indivizii și comunitățile din întreaga lume, în tranzacții care tind să îndeplinească doar fericirea, prin intermediul unei competiții sănătoase.`
}

const PL = {
  title: 'DreamPip — Fintech for compassion. 📡',
  description: `DreamPip wzmacnia doświadczenie szczęścia, inwestując w crowdfundingu i działalność charytatywną, łącząc jednostki i społeczności na całym świecie, w transakcjach, które dążą do spełnienia jedynie szczęścia, poprzez zdrową konkurencję.`
}

const CZ = {
  title: 'DreamPip — Fintech for compassion. 📡',
  description: `DreamPip zesiluje zážitek štěstí investováním do crowdfunding a charity, spojující jednotlivce a komunity po celém světě, v transakcích, které usilují o naplnění pouze štěstím, prostřednictvím zdravé soutěže.`
}

const SE = {
  title: 'DreamPip — Fintech for compassion. 📡',
  description: `DreamPip förstärker upplevelsen av lycka genom investeringar i crowdfunding och välgörenhet, som förbinder individer och samhällen över hela världen, genom transaktioner som strävar efter att endast uppfylla lycka genom hälsosam konkurrens.`
}

const EE = {
  title: 'DreamPip — Fintech for compassion. 📡',
  description: `DreamPip võimendab õnne kogemust, investeerides rahakogumisse ja heategevusse, ühendades üksikisikuid ja kogukondi kogu maailmas tehingutes, mis püüavad täita vaid õnne, tervisliku konkurentsi kaudu.`
}

const JP = {
  title: 'DreamPip — Fintech for compassion. 📡',
  description: `DreamPipは投資クラウドファンディングやチャリティを通じて幸福の経験を拡大し、世界中の個人やコミュニティをつなげ、純粋な幸福だけを追求する取引を行う健全な競争を通じて満足させることをめざしています。`
}

const RU = {
  title: 'DreamPip — Fintech for compassion. 📡',
  description: `DreamPip усиливает опыт счастья, инвестируя в краудфандинг и благотворительность, связывая людей и сообщества по всему миру в трансакциях, нацеленных лишь на счастье, через здоровое соперничество.`
}



export default function Home(props) {
  const { posts: parsedPosts, hero: parsedHeros, episodes } = props;
  const [live, setLive] = useState()
  const [feed, setFeed] = useState(!!episodes?.length ? [...episodes].slice(0, 4) : [].slice(0, 4))
  const [isStreamingVideo, setIsStreamingVideo] = useState(false);
  const { consent } = useContext(AppContext);

  const checkLive = async () => {
    if (!consent) return
    try {
      const auth = `https://www.dreampip.com/api/checklive`;
      const token = await fetch(auth)
      const json = await token.json()
      const status = json.data?.status
      if (status === 'RUNNING') {
        setIsStreamingVideo(true)
      } else {
        setIsStreamingVideo(false)
      }
    } catch (e) {
      Bugsnag.notify(e)
    }
  }

  useEffect(() => {
    if(!consent) return
    checkLive()
  }, [consent])

  const { locale: orig, pathname } = useRouter()
  const locale = orig === "default" ? "en" : orig

  const localeMap = {
    "it-it": IT,
    "pt-br": PT,
    "en": DEFAULT,
    "es-es": ES,
    "de-de": DE,
    "fr-fr": FR,
    "ro": RO,
    "pl-pl": PL,
    "cs-cz": CZ,
    "et-ee": EE,
    "ja-jp": JP,
    "ru-ru": RU,
  }

  const meta = localeMap[locale] || localeMap['en']
  const localization = HomeLocale[locale] || HomeLocale['default']

  const url = `https://www.dreampip.com${orig !== 'default' ? `/${locale}` : '/'}`

  useEffect(() => {
    const parsed = episodes?.length && [...episodes].map((episode) => {
      const now = new Date()
      const episodeDate = new Date(episode?.date)


      if (now < episodeDate) {
        return
      }

      return episode
    }).filter((e) => e?.featured).sort((a, b) => {
      return new Date(b?.date) - new Date(a?.date)
    }).slice(0, 4)

    setFeed(parsed)
  }, [live])

  useEffect(() => {
    if(!consent) return
    const liveCheckInterval = setInterval(checkLive(), 60000 * 15);

    const countdown = () => {
      
      episodes?.length && [...episodes]?.map((episode) => {
        const countDownDate = new Date(episode?.date).getTime()
        const now = new Date().getTime()
        const end = new Date(episode?.end).getTime()

        if (now > countDownDate && now < end) {
          if (!live || live !== episode?.url) {
            setLive(episode?.url)
          }
        } else if (live && live === episode?.url) {
          setLive(undefined)
        }
      })
    }

    const interval = setInterval(countdown, 1000)
    return () => {
      clearInterval(interval)
      clearInterval(liveCheckInterval)
    }
  }, [consent])

  return (
    <div>
      <Head>
        <title>{meta.title}</title>
        <meta property="og:title" content={meta.title} />
        <meta property="og:site_name" content="DreamPip" />
        <meta property="og:url" content={url} />
        <meta property="og:description" content={meta.description} />
        <meta name="description" content={meta.description} />
        <meta property="og:type" content="website" />
        <meta
          property="og:image"
          content="https://www.dreampip.com/og-image.png"
        />
        <meta
          property="og:image:secure_url"
          content="https://www.dreampip.com/og-image.png"
        />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <link rel="canonical" href={url} />
        <link rel="alternate" hrefLang="x-default" href={`https://www.dreampip.com/`} />
        {Object.keys(localeMap).map((locale) => {
          return <link key={locale} rel="alternate" hrefLang={locale} href={`https://www.dreampip.com/${locale}`} />
        })}
      </Head>
      <article className="content content-page !bg-soft-light">
        {parsedHeros?.length ? (
          <Hero
            title={parsedHeros?.title}
            bgImage={parsedHeros?.image?.url}
            buttonText={parsedHeros?.ctaText}
            buttonURL={parsedHeros?.ctaLink}
            isStreamingVideo={isStreamingVideo}
          >
            <p>{parsedHeros?.subTitle}</p>
          </Hero>
        ) : undefined}
        {isStreamingVideo && (
          <>
            <section
              style={{
                position: 'relative',
                width: '100%',
                zIndex: 2,
              }}>
              <ReactPlayer
                url="https://live.infra.dreampip.com/main.m3u8"
                controls={true}
                width="100%"
                height="auto"
                playsInline
              />
            </section>
          </>
        )}
        <section style={{ display: 'block', position: 'relative' }}>
          {/*<ShowGrid even {...{ items: feed, locale, live, directory: '/episode' }} />*/}
          {/* <Link href="/episodes"><span style={{ display: "block", textAlign: "center", margin: 32, width: "100%" }}>View all episodes</span></Link> */}
        </section>
        <section style={{ display: 'block', position: 'relative' }} className='wrap'>
          <Posts
            posts={parsedPosts}
            heading="Posts"
            headingLevel="h2"
            postTitleLevel="h3"
          />
          <div style={{ marginTop: "32px" }} className="mt-a3">
            <Button href={localizeUrl("/blog", locale)}>{localization['view']}</Button>
          </div>
        </section>
      </article>
    </div>
  );
}

export async function getStaticProps({ params, preview = false, locale }) {
  const data = await getHomeEpisodes(20, true)
  const hero = await getHeros(locale)
  const posts = await getHomePosts({ locale, limit: 6 })

  const newData = await addPlaceholders(data)
  const newPosts = await addPlaceholders(posts)
  const newHeroes = await addPlaceholders(hero)

  return {
    props: {
      preview,
      hero: newHeroes ?? null,
      posts: newPosts ?? null,
      episodes: newData ?? null,
    },
  }
}
export const maxDuration = 30;

Home.getLayout = function getLayout(page) {
  return (
    <Template>
      {page}
    </Template>
  )
}




