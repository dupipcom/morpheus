'use client'
import { useState } from 'react'
import { useSession, signIn, signOut } from "next-auth/react"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { getWeekNumber } from "@/app/helpers"

export const SettingsView = ({ timeframe = "day" }) => {
  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const year = Number(date.split('-')[0])
  const weekNumber = getWeekNumber(fullDate)[1]
  const { data: session, update } = useSession()
  

  const serverSettings = (session?.user?.settings) || {}

  const [mood, setMood] = useState(serverSettings)

  console.log({ serverSettings})

  const handleSubmit = async (value, field) => {
    setMood({...mood, [field]: value})
    console.log({ value, field 
    })
    const response = await fetch('/api/v1/user', 
      { method: 'POST', 
        body: JSON.stringify({
          settings: {
            [field]: value
          }
      }) 
    })
  }

  return <div className="max-w-[320px] m-auto">
      <h3 className="mt-8">Month’s Recurring Income</h3>
      <Input defaultValue={serverSettings.monthsFixedIncome} onBlur={(e) => handleSubmit(e.currentTarget.value, "monthsFixedIncome")} />
      <h3 className="mt-8">Month’s Variable Income</h3>
      <Input defaultValue={serverSettings.monthsVariableIncome} onBlur={(e) => handleSubmit(e.currentTarget.value, "monthsVariableIncome")}/>
      <h3 className="mt-8">Fixed Need Costs</h3>
      <Input defaultValue={serverSettings.monthsNeedFixedExpenses} onBlur={(e) => handleSubmit(e.currentTarget.value, "monthsNeedFixedExpenses")}/>
      <h3 className="mt-8">Expected Need Utilities Average</h3>
      <Input defaultValue={serverSettings.monthsNeedVariableExpenses} onBlur={(e) => handleSubmit(e.currentTarget.value, "monthsNeedVariableExpenses")}/>
    </div>
}