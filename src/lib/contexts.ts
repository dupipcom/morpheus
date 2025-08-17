import { createContext } from 'react'

export const GlobalContext = createContext({
	theme: 'light',
	session: {
		user: {}
	},
	setGlobalContext: (context: any) => {}
})