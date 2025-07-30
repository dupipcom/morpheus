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

const DAILY_ACTIONS = [
  {
    name: 'Drank Water',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
    status: 'Done'
  },
  {
    name: 'Showered',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
    status: 'Not started'
  },
  {
    name: 'Took meds',
    area: 'self',
    categories: ['body'],
    cadence: '2-daily',
    status: 'Not started'
  },
  {
    name: 'Logged mood',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
    status: 'Not started'
  },
  {
    name: 'Ate breakfast',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
    status: 'Not started'
  },
  {
    name: 'Ate lunch',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
    status: 'Not started'
  },
  {
    name: 'Ate dinner',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
    status: 'Not started'
  },
  {
    name: 'Brushed teeth',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
    status: 'Not started'
  },
  {
    name: 'Worked-out',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
    status: 'Not started'
  },
  {
    name: 'Worked',
    area: 'home',
    categories: ['work'],
    cadence: 'daily',
    status: 'Not started'
  },
  {
    name: 'Washed dishes',
    area: 'home',
    categories: ['clean'],
    cadence: 'daily',
    status: 'Not started'
  },
  {
    name: 'Stored dishes',
    area: 'home',
    categories: ['clean'],
    cadence: 'daily',
    status: 'Not started'
  },
  {
    name: 'Checked trash',
    area: 'home',
    categories: ['clean'],
    cadence: 'daily',
    status: 'Not started'
  },
  {
    name: 'Brushed floor',
    area: 'home',
    categories: ['clean'],
    cadence: 'daily',
    status: 'Not started'
  },
  {
    name: 'Made love',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
    status: 'Not started'
  },
  {
    name: 'Went out',
    area: 'social',
    categories: ['community'],
    cadence: 'daily',
    status: 'Not started'
  },
]

const WEEKS = {
  W30: {
    year: 2025,
    week: 29,
    startDay: "2025-07-20",
    endDay: "2025-07-26",
    availableBalance: 1832.32,
    earnings: 282.00,
    days: {
      '2025-07-20': {
        date: '2025-07-20',
        availableBalance: 1832.32,
        earnings: 271.32,
        status: 'Closed',
        tasks: DAILY_ACTIONS
      },
      '2025-07-21': {
        date: '2025-07-20',
        availableBalance: 1832.32,
        earnings: 271.32,
        status: 'Closed',
        tasks: DAILY_ACTIONS
      },
      '2025-07-22': {
        date: '2025-07-20',
        availableBalance: 1832.32,
        earnings: 271.32,
        status: 'Closed',
        tasks: DAILY_ACTIONS
      },
      '2025-07-23': {
        date: '2025-07-20',
        availableBalance: 1832.32,
        earnings: 271.32,
        status: 'Closed',
        tasks: DAILY_ACTIONS
      }
    }
  },
  W29: {
    year: 2025,
    week: 30,
    startDay: "2025-07-27",
    endDay: "2025-08-03",
    availableBalance: 1832.32,
    earnings: 280.00,
    days: {
      '2025-07-20': {
        date: '2025-07-20',
        availableBalance: 1832.32,
        earnings: 271.32,
        status: 'Closed',
        tasks: DAILY_ACTIONS
      },
      '2025-07-21': {
        date: '2025-07-20',
        availableBalance: 1832.32,
        earnings: 271.32,
        status: 'Closed',
        tasks: DAILY_ACTIONS
      },
      '2025-07-22': {
        date: '2025-07-20',
        availableBalance: 1832.32,
        earnings: 271.32,
        status: 'Closed',
        tasks: DAILY_ACTIONS
      },
      '2025-07-23': {
        date: '2025-07-20',
        availableBalance: 1832.32,
        earnings: 271.32,
        status: 'Closed',
        tasks: DAILY_ACTIONS
      }
    }
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

    return (
      <Globals theme={globalContext.theme}>
      <Nav onThemeChange={handleThemeChange} />
      <main className="min-h-[100vh]">
        
      <ViewMenu active="day" />

      <div className="flex flex-wrap justify-center">
        <Carousel>
          <CarouselContent>
            <CarouselItem className="flex flex-col text-center">        
              <small>$280</small>
              <label>Friday, Jul 25, 2025</label>
              
        <Button>Close day</Button></CarouselItem>
            <CarouselItem className="flex flex-col"><label>Saturday, Jul 26, 2025</label>
              <small>$280</small>
        <Button>Close day</Button></CarouselItem>
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>

    </div>
      <div className="m-8 flex flex-col justify-center text-center">
        <label>It's {new Date().toLocaleString("en-US", {weekday: "long", year: "numeric", month: "short", day: "numeric" })}.</label>
      </div>
      <p className="m-8 text-center">What did you accomplish today?</p>

      <TaskView actions={DAILY_ACTIONS} />
       <p className="m-8 text-center">Your earnings today, so far: $</p>
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
