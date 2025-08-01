'use client'

import React, { useRef, useState, useEffect, useContext } from 'react'
import ReactDOMServer from 'react-dom/server';
import '@mux/mux-video';

import Link from 'next/link'
import { NotionRenderer, createBlockRenderer } from "@notion-render/client"

import { Typography, TypographyVariant, ENavControlVariant, EIcon, AudioPlayer } from '@dreampipcom/oneiros'
import "@dreampipcom/oneiros/styles"

import Layout from './layout'
import { GlobalContext } from "./contexts"
import { useSession, signIn, signOut } from "next-auth/react"
import { AnalyticsView } from "@/views/analyticsView"
import { ViewMenu } from "@/components/viewMenu"




export default function Template({ title, content, isomorphicContent }: any) {
  const [globalContext, setGlobalContext] = useState({
    theme: 'light'
  })

  const { data: session } = useSession()


  const handleThemeChange = () => {
    if (globalContext.theme === 'light') {
      setGlobalContext({...globalContext, theme: 'dark'})
    } else {
      setGlobalContext({...globalContext, theme: 'light'})
    }
  }

    return (
      <main className="min-h-[100vh]">
      <ViewMenu active="dashboard" />
      <h1 className="scroll-m-20 text-2xl font-semibold tracking-tight text-center mb-8">{new Date().toLocaleString("en-US", {weekday: "long", year: "numeric", month: "short", day: "numeric" })}</h1>
      <h2 className="text-center scroll-m-20 text-lg font-semibold tracking-tight">Your life at a glimpse.</h2>
      <AnalyticsView />
      </main>
    )
}
