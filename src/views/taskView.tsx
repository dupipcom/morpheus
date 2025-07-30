'use client'
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Slider } from "@/components/ui/slider"

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

const WEEKLY_ACTIONS = [
  {
    name: 'Create content for social media',
    area: 'social',
    categories: ['community'],
    cadence: 'weekly',
  },
  {
    name: 'Flirt with someone',
    area: 'social',
    categories: ['affection'],
    cadence: 'weekly',
  },
  {
    name: 'Talk to a friend',
    area: 'social',
    categories: ['affection'],
    cadence: 'weekly',
  },
  {
    name: 'Navigate social media',
    area: 'social',
    categories: ['community'],
    cadence: 'weekly',
  },
  {
    name: 'Talk to family',
    area: 'social',
    categories: ['affection'],
    cadence: 'weekly',
  },
  {
    name: 'Make music',
    area: 'self',
    categories: ['fun'],
    cadence: 'weekly',
  },
  {
    name: 'Meditate',
    area: 'self',
    categories: ['spirituality'],
    cadence: 'weekly',
  },
  {
    name: 'Pray',
    area: 'self',
    categories: ['spirituality'],
    cadence: 'weekly',
  },
  {
    name: 'Read the Bible',
    area: 'self',
    categories: ['spirituality'],
    cadence: 'weekly',
  },
  {
    name: 'Share learnings',
    area: 'social',
    categories: ['community'],
    cadence: 'weekly',
  },
  {
    name: 'Study a subject',
    area: 'self',
    categories: ['growth'],
    cadence: 'weekly',
  },
  {
    name: 'Watch some educational content',
    area: 'self',
    categories: ['growth'],
    cadence: 'weekly',
  },
  {
    name: 'Play a game',
    area: 'self',
    categories: ['fun'],
    cadence: 'weekly',
  },
  {
    name: 'Watch series or film',
    area: 'self',
    categories: ['fun'],
    cadence: 'weekly',
  },
  {
    name: 'Read news',
    area: 'social',
    categories: ['community'],
    cadence: 'weekly',
  },
  {
    name: 'Write an opinion',
    area: 'social',
    categories: ['community'],
    cadence: 'weekly',
  },
  {
    name: 'Clean bed',
    area: 'home',
    categories: ['clean'],
    cadence: 'weekly',
  },
  {
    name: 'Ensure bedroom is ordered',
    area: 'home',
    categories: ['clean'],
    cadence: 'weekly',
  },
  {
    name: 'Shave body',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
  },
  {
    name: 'Shave face',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
  },
  {
    name: 'Cut nails',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
  },
  {
    name: 'Brush surfaces',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
  },
  {
    name: 'Mop floors',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
  },
  {
    name: 'Wash clothes',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
  },
  {
    name: 'Clean bathroom',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
  },
  {
    name: 'Clean kitchen',
    area: 'home',
    categories: ['clean', 'extra'],
    cadence: 'weekly',
  },
  {
    name: 'Work on personal project',
    area: 'self',
    categories: ['work'],
    cadence: 'weekly',
  },
  {
    name: 'Help someone',
    area: 'social',
    categories: ['community'],
    cadence: 'weekly',
  },
  {
    name: 'Buy groceries',
    area: 'home',
    categories: ['maintenance'],
    cadence: 'weekly',
  },
]

export const TaskView = ({ timeframe = "day" }) => {
  const dataset = timeframe === "day" ? DAILY_ACTIONS : WEEKLY_ACTIONS
  return <>
  <ToggleGroup className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-8 align-center justify-center w-full m-auto" type="multiple" orientation="horizontal">
   { dataset.map((action) => {
      return <ToggleGroupItem value={action.name}>{action.name}</ToggleGroupItem>
    }) }
  </ToggleGroup>
    </>
}