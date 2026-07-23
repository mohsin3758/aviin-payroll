'use client'

import { useCallback, useEffect, useState } from 'react'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'hr' | 'manager' | 'employee'
  employeeId: string | null
}

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/session')
      const json = await res.json()
      setUser(json.user ?? null)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }, [])

  return { user, loading, refresh, logout }
}
