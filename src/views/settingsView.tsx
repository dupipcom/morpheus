'use client'
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

export const SettingsView = ({ timeframe = "day" }) => {
  return <div className="max-w-[320px] m-auto">
      <h3 className="mt-8">Month’s Recurring Income</h3>
      <Input />
      <h3 className="mt-8">Month’s Variable Income</h3>
      <Input />
      <h3 className="mt-8">Fixed Need Costs</h3>
      <Input />
      <h3 className="mt-8">Expected Need Utilities Average</h3>
      <Input />
      <Button className="my-8 w-full">Save</Button>
    </div>
}