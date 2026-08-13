import { createContext } from 'react'

// GlobalContext was slimmed during the Do rebuild (#441 follow-up):
// task lists/templates moved to SWR hooks (useTaskLists); the optimistic
// earnings callbacks were removed with the budget distribution system.
export const GlobalContext = createContext({
	theme: 'light',
	session: {
		user: {}
	},
	setGlobalContext: (context: any) => {},
	revealRedacted: false,
	selectedDate: undefined as Date | undefined,
	setSelectedDate: (date: Date | undefined) => {},
	isNavigating: false,
	setIsNavigating: (isNavigating: boolean) => {},
	dayData: {} as Record<string, any>,
	setDayData: (date: string, data: any) => {},
})
