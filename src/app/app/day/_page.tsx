'use client'

import React, { useRef, useState, useEffect, useContext } from 'react'
import ReactDOMServer from 'react-dom/server';
import prisma from "@/lib/prisma";

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
import { DAILY_ACTIONS, WEEKS } from "@/app/constants"

export default function Template({ title, content, isomorphicContent }: any) {
  const [globalContext, setGlobalContext] = useState({
    theme: 'light'
  })

  const { data: session, update } = useSession()

  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]

  const actions = (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year][weekNumber] && session?.user?.entries[year][weekNumber].days[date] && session?.user?.entries[year][weekNumber].days[date].tasks) || DAILY_ACTIONS



  const flatDays = Object.values(WEEKS).flatMap((week) => week.days).reduce((acc, week) => {
    acc = {...acc, ...week}
    return acc
  }, {})

  const openDays = Object.values(flatDays).filter((day) => day.status === "Open")


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

      <div className="scroll-m-20 text-2xl font-semibold tracking-tight text-center mb-8">
        <label>Today is {new Date().toLocaleString("en-US", {weekday: "long", year: "numeric", month: "short", day: "numeric" })}.</label>
      </div>
      
      <p className="text-center scroll-m-20 text-lg font-semibold tracking-tight mb-8">What did you accomplish today?</p>

      <TaskView actions={actions} />
       <p className="m-8 text-center">Your earnings today, so far: $</p>

       
      <div className="flex flex-wrap justify-center">
        <Carousel>
          <CarouselContent>
            {
              openDays.map((day) => {
                return <CarouselItem className="flex flex-col">
                  <small>$280</small>
                  <label>Friday, Jul 25, 2025</label>
                  <Button>Close day</Button>
                </CarouselItem>
              })
            }
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>

    </div>
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