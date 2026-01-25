import { createContext } from 'react'

// Profile type for friend/collaborator profiles
export interface FriendProfile {
	userId: string
	userName: string | null
	firstName?: string | null
	lastName?: string | null
	profilePicture?: string | null
	bio?: string | null
	isCloseFriend?: boolean
	isFriend?: boolean
}

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
	// Friend profiles - preloaded on app start to avoid repeated fetches
	friendProfiles: [] as FriendProfile[],
	refreshFriendProfiles: async () => {},
})