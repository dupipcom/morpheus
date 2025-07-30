'use client'
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

export const MoodView = ({ timeframe = "day" }) => {
  return <div className="max-w-[320px] m-auto">
      <h3 className="mt-8">Gratitude</h3>
      <Slider defaultValue={[3]} max={5} step={1}/>
      <h3 className="mt-8">Acceptance</h3>
      <Slider defaultValue={[3]} max={5} step={1}/>
      <h3 className="mt-8">Restedness</h3>
      <Slider defaultValue={[3]} max={5} step={1}/>
      <h3 className="mt-8">Tolerance</h3>
      <Slider defaultValue={[3]} max={5} step={1}/>
      <h3 className="mt-8">Self-Esteem</h3>
      <Slider defaultValue={[3]} max={5} step={1}/>
      <h3 className="mt-8">Trust in others</h3>
      <Slider defaultValue={[3]} max={5} step={1}/>
      <h3 className="mt-8">What's in your mind?</h3>
      <Textarea />
      <Button className="my-8 w-full">Submit</Button>
    </div>
}