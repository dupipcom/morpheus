'use client'

import React, { useRef, useState, useEffect, useContext } from 'react'
import ReactDOMServer from 'react-dom/server';
import '@mux/mux-video';

import Link from 'next/link'
import { NotionRenderer, createBlockRenderer } from "@notion-render/client"

import { Globals, Nav, Typography, TypographyVariant, ENavControlVariant, EIcon, AudioPlayer } from '@dreampipcom/oneiros'
import "@dreampipcom/oneiros/styles"

import Layout from './layout'
import { GlobalContext } from "./contexts"
import { useSession, signIn, signOut } from "next-auth/react"
import { TaskView } from "@/views/taskView"
import { ViewMenu } from "@/components/viewMenu"
import { Button } from "@/components/ui/button"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import { getWeekNumber } from "@/app/helpers"
import { WEEKLY_ACTIONS, WEEKS } from "@/app/constants"

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

    const Weeks = () => 
        Object.values(WEEKS).map((week) => {
          return <div className="flex flex-col text-center m-2">
            <small>${week.earnings}</small>
            <label>Week {week.week}</label>
            <small>{week.startDay} to {week.endDay}</small>
            <Button>Close week</Button>
          </div>
    })

    return (
      <Globals theme={globalContext.theme}>
      <Nav onThemeChange={handleThemeChange} />
      <main className="min-h-[100vh]">

        <ViewMenu active="week" />
        <h1 className="scroll-m-20 text-2xl font-semibold tracking-tight text-center mb-8">This is {getWeekNumber(new Date())}.</h1>
        
        
        <p className="text-center scroll-m-20 text-lg font-semibold tracking-tight mb-8">What did you accomplish so far?</p>

      <TaskView timeframe="week" actions={WEEKLY_ACTIONS} />
      <p className="m-8 text-center">Your earnings this week, so far: $</p>
      <Carousel className="max-w-[320px] m-auto">
          <CarouselContent className="">
            <Weeks />
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
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
