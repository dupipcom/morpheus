'use client'
import { useState } from 'react'
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
  

  const serverMood = (session?.user?.entries && session?.user?.entries[year] && session?.user?.entries[year].days && session?.user?.entries[year].days[date] && session?.user?.entries[year].days[date].mood) || {}

  const [mood, setMood] = useState(serverMood)

  const handleSubmit = async (value, field) => {
    setMood({...mood, [field]: value})
    const response = await fetch('/api/v1/user', 
      { method: 'POST', 
        body: JSON.stringify({
          mood: {
            [field]: value
          }
      }) 
    })
  }

  return <div key={JSON.stringify(serverMood)} className="max-w-[320px] m-auto">
      <h3 className="mt-8">Gratitude</h3>
      <Slider defaultValue={[serverMood.gratitude || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "gratitude")} />
      <h3 className="mt-8">Acceptance</h3>
      <Slider defaultValue={[serverMood.acceptance || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "acceptance")} />
      <h3 className="mt-8">Restedness</h3>
      <Slider defaultValue={[serverMood.restedness || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "restedness")} />
      <h3 className="mt-8">Tolerance</h3>
      <Slider defaultValue={[serverMood.tolerance || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "tolerance")} />
      <h3 className="mt-8">Self-Esteem</h3>
      <Slider defaultValue={[serverMood.selfEsteem || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "selfEsteem")} />
      <h3 className="mt-8">Trust in others</h3>
      <Slider defaultValue={[serverMood.trust || 0]} max={5} step={1} onValueCommit={(e) => handleSubmit(e[0], "trust")} />
      <h3 className="mt-8">What's in your mind?</h3>
      <Textarea defaultValue={serverMood.text} onBlur={(e) => handleSubmit(e.target.value, "text")} />
    </div>
}