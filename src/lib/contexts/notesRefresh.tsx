'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'

interface NotesRefreshContextType {
  registerMutate: (key: string, mutate: () => void) => void
  unregisterMutate: (key: string) => void
  refreshAll: () => void
}

const NotesRefreshContext = createContext<NotesRefreshContextType | undefined>(undefined)

export function NotesRefreshProvider({ children }: { children: React.ReactNode }) {
  const [mutateFunctions, setMutateFunctions] = useState<Map<string, () => void>>(new Map())

  const registerMutate = useCallback((key: string, mutate: () => void) => {
    setMutateFunctions(prev => {
      const next = new Map(prev)
      next.set(key, mutate)
      return next
    })
  }, [])

  const unregisterMutate = useCallback((key: string) => {
    setMutateFunctions(prev => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])

  const refreshAll = useCallback(() => {
    mutateFunctions.forEach(mutate => {
      mutate()
    })
  }, [mutateFunctions])

  return (
    <NotesRefreshContext.Provider value={{ registerMutate, unregisterMutate, refreshAll }}>
      {children}
    </NotesRefreshContext.Provider>
  )
}

export function useNotesRefresh() {
  const context = useContext(NotesRefreshContext)
  if (context === undefined) {
    // Return no-op functions if context is not available (for backwards compatibility)
    return {
      registerMutate: () => {},
      unregisterMutate: () => {},
      refreshAll: () => {}
    }
  }
  return context
}

