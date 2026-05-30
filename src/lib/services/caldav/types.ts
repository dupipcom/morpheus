export interface BusySlot {
  start: string // ISO 8601
  end: string   // ISO 8601
}

export interface CalendarAvailabilityResult {
  busy: BusySlot[]
  error?: string
}
