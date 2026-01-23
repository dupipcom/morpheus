import { createContext } from 'react'

export const GlobalContext = createContext({
	theme: 'light',
	session: {
		user: {}
	},
	taskLists: [] as any[],
	refreshTaskLists: async () => {},
	templates: [] as any[],
	refreshTemplates: async () => {},
	setGlobalContext: (context: any) => {},
	revealRedacted: false,
	selectedDate: undefined as Date | undefined,
	setSelectedDate: (date: Date | undefined) => {},
	isNavigating: false,
	setIsNavigating: (isNavigating: boolean) => {},
	dayData: {} as Record<string, any>,
	setDayData: (date: string, data: any) => {},
	// Optimistic update callbacks
	addOptimisticTaskEarnings: () => {},
	addOptimisticCompletion: () => {},
	handleTaskCompletionOptimistic: () => {},
	// Task list initialization state - true while initially loading task lists for new users
	isInitializingTaskLists: true,
})