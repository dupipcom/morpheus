'use client'

import React, { useRef, useState, useEffect, useContext } from 'react'
import ReactDOMServer from 'react-dom/server';
import { useRouter } from 'next/navigation'

import '@mux/mux-video';

import { Button } from "@/components/ui/button"


import Link from 'next/link'
import { NotionRenderer, createBlockRenderer } from "@notion-render/client"

import { Globals, Nav, Typography, TypographyVariant, ENavControlVariant, EIcon, AudioPlayer } from '@dreampipcom/oneiros'
import "@dreampipcom/oneiros/styles"

import Layout from './layout'
import { GlobalContext } from "./contexts"
import { useSession, signIn, signOut } from "next-auth/react"



export default function Template({ title, content, isomorphicContent }: any) {

  /* 
    05/2025: we currently need this implementation to preserve SEO capabilities, and keep CLS to a minimum, 
    where the hydration is isomorphic, regardless of using custom renderers 
    for different richtext blocks, which will glitch upon loading.
    reasons for this are:
      1. we use ESM for Oneiros, so it can only run on the client. it has a CJS bundle available, but we need to set it up in this Next.js instance so it will be available during build time.
      2. the library for parsing Notion returns a promise from the render function, so either it only runs on the server without Oneiros as a custom visual representation of the content (we keep doing it for this hydration engine to be isomorphic), or we contribute to it for it to have a synchronous export as well: e.g. syncRender.
  */
  const [html, setHtml] = useState(isomorphicContent)
  const [showStream, setShowStream] = useState(false)

  // i know this is a funny theme implementation, but i wasn't even thinking of supporting it now, and we need contexts with more structure than snug coding.
  const [globalContext, setGlobalContext] = useState({
    theme: 'light'
  })

  const { data: session } = useSession()
  const router = useRouter()

  if (session?.user) {
    router.push('/app/dashboard')
  }

  console.log({ session })

  const handleThemeChange = () => {
    if (globalContext.theme === 'light') {
      setGlobalContext({...globalContext, theme: 'dark'})
    } else {
      setGlobalContext({...globalContext, theme: 'light'})
    }
  }


  useEffect(() => {
    if (Array.isArray(content)) {
      const renderer = new NotionRenderer({
        renderers: [paragraphRenderer, headingRenderer]
      })
      renderer.render(...content).then((_html) => {
        setHtml(_html)
      })
    }

    const checkLive = async () => {
      try {
          const req = await fetch("https://video.dreampip.com/live/index.m3u8")
          if (req.status === 200) setShowStream(true)
          else setShowStream(false)
      } catch (e) {
        setShowStream(false)
      }
    }

    checkLive()
    setInterval(checkLive, 5000)

  }, [])

  // try not to lazy around for long and actually update Oneiros components to include the right margins, Angelo. I'll let this one pass since we're using a single renderer parser for the whole hydration engine and we need some more content live (minimalism is good, but SEO is important).

  const paragraphRenderer = createBlockRenderer<ParagraphBlockObjectResponse>(
    'paragraph',
    (data, renderer) => {
      
      if (data.paragraph.rich_text.length === 0) return
      return ReactDOMServer.renderToStaticMarkup(<Typography className="!mb-[12px]" variant={TypographyVariant.BODY} >{data.paragraph.rich_text[0].plain_text}</Typography>);
    }
  );

  const headingRenderer = createBlockRenderer<HeadingBlockObjectResponse>(
    'heading_1',
    (data, renderer) => {
      if (data.heading_1.length === 0) return
      return ReactDOMServer.renderToStaticMarkup(<Typography variant={TypographyVariant.H1} >{data.heading_1.rich_text[0].plain_text}</Typography>);
    }
  );


  return (
      <Globals theme={globalContext.theme}>
        <Nav onThemeChange={handleThemeChange} />
        <main className="min-h-[100vh]">
          { showStream ? (
              <div className="w-full">
                <mux-video 
                  src="https://video.dreampip.com/live/index.m3u8"
                  controls={true}
                  autoPlay={true}
                  playsInline={true}
                  className="w-full"
                  type="hls"
                  preferPlayback="mse"
                />
              </div>
            ) : undefined}
          { !session?.user ? <div className="my-16 w-full flex align-center justify-center">
      <Button className="m-auto"><a  href="/login">Login</a></Button>
    </div> : <div className="my-16 w-full flex align-center justify-center">
      <Button className="m-auto"><a  href="/app/dashboard">Dashboard</a></Button>
    </div>
  }
          { title && !content ? <Typography className="p-[32px] md:p-[64px] md:max-w-[720px] md:m-auto" variant={TypographyVariant.H1}>{title}</Typography> : undefined }
          { content ? <div className="p-[32px] md:p-[64px] md:max-w-[720px] md:m-auto">
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div> : undefined }
          <footer>
            <div className="flex w-full flex-center justify-center p-a2">
              <Typography>
                © 1992—Present Angelo Reale
              </Typography>
            </div>
          </footer>
        </main>
      </Globals>
  )
}
