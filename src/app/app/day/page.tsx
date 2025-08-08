'use client'

import React, { useRef, useState, useEffect, useContext } from 'react'
import ReactDOMServer from 'react-dom/server';
import prisma from "@/lib/prisma";

import Link from 'next/link'

import Layout from './layout'

import { TaskView } from "@/views/taskView"
import { ViewMenu } from "@/components/viewMenu"
import { Button } from "@/components/ui/button"


import { getWeekNumber } from "@/app/helpers"
import { DAILY_ACTIONS, WEEKS } from "@/app/constants"

import { GlobalContext } from "@/lib/contexts"

export default function Template({ title, content, isomorphicContent }: any) {
  const { session, setGlobalContext } = useContext(GlobalContext)

  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]

  const actions = (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year][weekNumber] && session?.user?.entries[year][weekNumber].days[date] && session?.user?.entries[year][weekNumber].days[date].tasks) || DAILY_ACTIONS



  const flatDays = Object.values(WEEKS).flatMap((week) => week.days).reduce((acc, week) => {
    acc = {...acc, ...week}
    return acc
  }, {})


  const handleThemeChange = () => {
    if (globalContext.theme === 'light') {
      setGlobalContext({...globalContext, theme: 'dark'})
    } else {
      setGlobalContext({...globalContext, theme: 'light'})
    }
  }

    return (
      <main className="min-h-[100vh]">
        
      <ViewMenu active="day" />

      <div className="scroll-m-20 text-2xl font-semibold tracking-tight text-center mb-8">
        <label>Today is {new Date().toLocaleString("en-US", {weekday: "long", year: "numeric", month: "short", day: "numeric" })}.</label>
      </div>
      
      <p className="text-center scroll-m-20 text-lg font-semibold tracking-tight mb-8">What did you accomplish today?</p>

      <TaskView actions={actions} />
      </main>
    )
}