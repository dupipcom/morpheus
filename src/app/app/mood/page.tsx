'use client'

import React, { useRef, useState, useEffect, useContext } from 'react'
import ReactDOMServer from 'react-dom/server';

import Link from 'next/link'

import Layout from './layout'
import { GlobalContext } from "./contexts"

import { MoodView } from "@/views/moodView"
import { ViewMenu } from "@/components/viewMenu"



export default function Template({ title, content, isomorphicContent }: any) {
  const [globalContext, setGlobalContext] = useState({
    theme: 'light'
  })

  const session = {
    user: {}
  }

  const handleThemeChange = () => {
    if (globalContext.theme === 'light') {
      setGlobalContext({...globalContext, theme: 'dark'})
    } else {
      setGlobalContext({...globalContext, theme: 'light'})
    }
  }

    return (
      <main className="min-h-[100vh]">
        <ViewMenu active="mood" />
        <h1 className="scroll-m-20 text-2xl font-semibold tracking-tight text-center mb-8">It's {new Date().toLocaleString("en-US", {weekday: "long", year: "numeric", month: "short", day: "numeric" })}.</h1>
        <p className="text-center scroll-m-20 text-lg font-semibold tracking-tight mb-8">u k, g?</p>
        <MoodView />
    
      </main>
    )
}
