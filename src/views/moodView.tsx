'use client'
import { useState, useEffect } from 'react'
import { useSession, signIn, signOut } from "next-auth/react"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { getWeekNumber } from "@/app/helpers"

export const MoodView = ({ timeframe = "day" }) => {
  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]
  const { data: session, update } = useSession()
  const [insight, setInsight] = useState({})
  

  const serverMood = (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date] && session?.user?.entries[year].days[date].mood) || {}

  const serverText = (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date] && session?.user?.entries[year].days[date].text) || ""

  const [mood, setMood] = useState(serverMood)

  const handleSubmit = async (value, field) => {
    setMood({...mood, [field]: value})

    if (field === 'text') {
      const response = await fetch('/api/v1/user', 
      { method: 'POST', 
        body: JSON.stringify({
          text: value
      }) 
    })
    } else {
      const response = await fetch('/api/v1/user', 
      { method: 'POST', 
        body: JSON.stringify({
          mood: {
            [field]: value
          }
        }) 
      })
    }

  }

  const generateInsight = async (value, field) => {
    const response = await fetch('/api/v1/hint', { method: 'GET' }, {
  cache: 'force-cache',
  next: {
    revalidate: 86400,
    tags: ['test'],
  },
})
    const json = await response.json()
    setInsight(json.result)
  }

  useEffect(() => {
    generateInsight()
  }, [])

  if (!session?.user) {
    return <div className="my-16 w-full flex align-center justify-center">
      <Button className="m-auto"><a  href="/login">Login</a></Button>
    </div>
  }

  return <div key={JSON.stringify(serverMood)} className="max-w-[320px] m-auto">
          <h3 className="mt-8 mb-4">What's in your mind?</h3>
      <Textarea defaultValue={serverText} onBlur={(e) => handleSubmit(e.target.value, "text")} />
      <div className="my-8">
        <h3 className="mt-8 mb-4">Gratitude</h3>
        <small>{insight?.gratitudeAnalysis}</small>
      </div>
      <Slider defaultValue={[serverMood.gratitude || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "gratitude")} />
      <div className="my-8">
        <h3 className="mt-8 mb-4">Optimism</h3>
        <small>{insight?.optimismAnalysis}</small>
      </div>
      <Slider defaultValue={[serverMood.optimism || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "optimism")} />
      <div className="my-8">
        <h3 className="mt-8 mb-4">Restedness</h3>
        <small>{insight?.restednessAnalysis}</small>
      </div>
      <Slider defaultValue={[serverMood.restedness || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "restedness")} />
      <div className="my-8">
        <h3 className="mt-8 mb-4">Tolerance</h3>
        <small>{insight?.toleranceAnalysis}</small>
      </div>
      <Slider defaultValue={[serverMood.tolerance || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "tolerance")} />
      <div className="my-8">
        <h3 className="mt-8 mb-4">Self-Esteem</h3>
        <small>{insight?.selfEsteemAnalysis}</small>
      </div>
      <Slider defaultValue={[serverMood.selfEsteem || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "selfEsteem")} />
      <div className="my-8">
        <h3 className="mt-8 mb-4">Trust</h3>
        <small>{insight?.trustAnalysis}</small>
      </div>
      <Slider defaultValue={[serverMood?.trust || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "trust")} />
    </div>
}