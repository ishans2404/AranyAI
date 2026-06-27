import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { hasPermission, ROLES } from './roles'

const STORAGE_KEY = 'aranyai.session'

const AuthContext = createContext(null)

function readStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser)

  useEffect(() => {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    else localStorage.removeItem(STORAGE_KEY)
  }, [user])

  const login = useCallback((role, name) => {
    setUser({ role, name: name || (role === ROLES.ADMIN ? 'Administrator' : name) })
  }, [])

  const logout = useCallback(() => setUser(null), [])

  const can = useCallback((permission) => hasPermission(user?.role, permission), [user])

  return (
    <AuthContext.Provider value={{ user, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
