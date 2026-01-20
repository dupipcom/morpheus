'use client'

import React, { useRef, useState, useEffect, useContext } from 'react'

import '@mux/mux-video';

import { Button } from "@/components/ui/button"

import { useAuth } from "@clerk/clerk-react";


import Link from 'next/link'

import Layout from './layout'
import { GlobalContext } from "./contexts"


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
  const { userId, sessionId, getToken, isLoaded, isSignedIn } = useAuth();


  useEffect(() => {
    // Content is now handled by Payload CMS RichText component
    // Set HTML from isomorphicContent if provided
    if (isomorphicContent) {
      setHtml(isomorphicContent)
    }

    const checkLive = async () => {
      try {
          const req = await fetch("https://video.dupip.com/live/index.m3u8")
          if (req.status === 200) setShowStream(true)
          else setShowStream(false)
      } catch (e) {
        setShowStream(false)
      }
    }

    checkLive()
    setInterval(checkLive, 5000)

  }, [isomorphicContent])


  return (

        <main className="">
          { showStream ? (
              <div className="w-full">
                <mux-video 
                  src="https://video.dupip.com/live/index.m3u8"
                  controls={true}
                  autoPlay={true}
                  playsInline={true}
                  className="w-full"
                  type="hls"
                  preferPlayback="mse"
                />
              </div>
            ) : undefined}
          { title && !content ? <p className="p-[32px] md:p-[64px] md:max-w-[720px] md:m-auto">{title}</p> : undefined }
          { content ? <div className="p-[32px] md:p-[64px] md:max-w-[720px] md:m-auto">
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div> : undefined }
        </main>
  )
}
