import { createContext } from 'react'

export const GlobalContext = createContext({
	theme: 'light',
	session: {
		user: {}
	},
	taskLists: [] as any[],
	refreshTaskLists: async () => {},
	setGlobalContext: (context: any) => {}
})