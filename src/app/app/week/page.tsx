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

const WEEKLY_ACTIONS = [
  {
    name: 'Create content for social media',
    area: 'social',
    categories: ['community'],
    cadence: 'weekly',
    status: "Done"
  },
  {
    name: 'Flirt with someone',
    area: 'social',
    categories: ['affection'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Talk to a friend',
    area: 'social',
    categories: ['affection'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Navigate social media',
    area: 'social',
    categories: ['community'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Talk to family',
    area: 'social',
    categories: ['affection'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Make music',
    area: 'self',
    categories: ['fun'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Meditate',
    area: 'self',
    categories: ['spirituality'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Pray',
    area: 'self',
    categories: ['spirituality'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Read the Bible',
    area: 'self',
    categories: ['spirituality'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Share learnings',
    area: 'social',
    categories: ['community'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Study a subject',
    area: 'self',
    categories: ['growth'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Watch some educational content',
    area: 'self',
    categories: ['growth'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Play a game',
    area: 'self',
    categories: ['fun'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Watch series or film',
    area: 'self',
    categories: ['fun'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Read news',
    area: 'social',
    categories: ['community'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Write an opinion',
    area: 'social',
    categories: ['community'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Clean bed',
    area: 'home',
    categories: ['clean'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Ensure bedroom is ordered',
    area: 'home',
    categories: ['clean'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Shave body',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Shave face',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Cut nails',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Brush surfaces',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Mop floors',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Wash clothes',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Clean bathroom',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Clean kitchen',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Work on personal project',
    area: 'self',
    categories: ['work'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Help someone',
    area: 'social',
    categories: ['community'],
    cadence: 'weekly',
    status: "Not started"
  },
  {
    name: 'Buy groceries',
    area: 'home',
    categories: ['maintenance'],
    cadence: 'weekly',
    status: "Not started"
  },
]

const WEEKS = {
  W30: {
    year: 2025,
    week: 29,
    startDay: "2025-07-20",
    endDay: "2025-07-26",
    earnings: 282.00,
    tasks: WEEKLY_ACTIONS
  },
  W29: {
    year: 2025,
    week: 30,
    startDay: "2025-07-27",
    endDay: "2025-08-03",
    earnings: 280.00,
    tasks: WEEKLY_ACTIONS
  },
}


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
        <h1 className="m-8 text-center">This is {getWeekNumber(new Date())}.</h1>
        <Carousel className="max-w-[320px] m-auto">
          <CarouselContent className="">
            <Weeks />
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
        
        <p className="m-8 text-center">What did you accomplish so far?</p>

      <TaskView timeframe="week" actions={WEEKLY_ACTIONS} />
      <p className="m-8 text-center">Your earnings this week, so far: $</p>
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
