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
	setIsNavigating: (isNavigating: boolean) => {}
})