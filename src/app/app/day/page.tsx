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
    name: 'Drink Water',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
  },
  {
    name: 'Shower',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
  },
  {
    name: 'Take meds',
    area: 'self',
    categories: ['body'],
    cadence: '2-daily',
  },
  {
    name: 'Log mood',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
  },
  {
    name: 'Eat breakfast',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
  },
  {
    name: 'Eat lunch',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
  },
  {
    name: 'Eat dinner',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
  },
  {
    name: 'Brush teeth',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
  },
  {
    name: 'Workout',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
  },
  {
    name: 'Use CBD',
    area: 'self',
    categories: ['spirituality'],
    cadence: 'daily',
  },
  {
    name: 'Work',
    area: 'home',
    categories: ['work'],
    cadence: 'daily',
  },
  {
    name: 'Wash dishes',
    area: 'home',
    categories: ['clean'],
    cadence: 'daily',
  },
  {
    name: 'Store dishes',
    area: 'home',
    categories: ['clean'],
    cadence: 'daily',
  },
  {
    name: 'Check trash',
    area: 'home',
    categories: ['clean'],
    cadence: 'daily',
  },
  {
    name: 'Brush floor',
    area: 'home',
    categories: ['clean'],
    cadence: 'daily',
  },
  {
    name: 'Had an orgasm',
    area: 'self',
    categories: ['body'],
    cadence: 'daily',
  },
  {
    name: 'Went out',
    area: 'social',
    categories: ['community'],
    cadence: 'daily',
  },
]




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

      <TaskView />
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
