'use client'
import { useState, useMemo } from "react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Slider } from "@/components/ui/slider"

export const TaskView = ({ timeframe = "day", actions = [] }) => {
  const done = actions.filter((action) => action.status === "Done").map((action) => action.name)
  const [values, setValues] = useState(done)

  const handleDone = (values) => {
    setValues(values)
    fetch('/api/v1/user', { method: 'POST', body: JSON.stringify({}) })
    upsertDay()
  }

  const nextActions = useMemo(() => {
    return actions.map((action) => {
      const clonedAction = { ...action }
      if (values.includes(action.name)) {
        clonedAction.status = "Done"
      } else {
        clonedAction.status = "Open"
      }
      return clonedAction
    })}, [values]) 



  return <>
  <ToggleGroup defaultValue={done} value={values} onValueChange={handleDone} variant="outline" className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-8 align-center justify-center w-full m-auto" type="multiple" orientation="horizontal">
   { actions.map((action) => {
      return <ToggleGroupItem value={action.name}>{action.name}</ToggleGroupItem>
    }) }
  </ToggleGroup>
    </>
}