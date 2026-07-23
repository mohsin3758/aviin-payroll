'use client'

import { createContext, useContext } from 'react'
import type { SessionUser } from './use-session'

interface SessionContextValue {
  user: SessionUser | null
  logout: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue>({ user: null, logout: async () => {} })

export function SessionProvider({
  value,
  children,
}: {
  value: SessionContextValue
  children: React.ReactNode
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSessionContext() {
  return useContext(SessionContext)
}
