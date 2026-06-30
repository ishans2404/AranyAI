import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { hasPermission } from './roles'
import { api } from '../lib/api'

const TOKEN_KEY = 'aranyai.token'

const AuthContext = createContext(null)

/**
 * Persistent login: the JWT lives in localStorage (not just memory), and
 * on mount we verify it against GET /api/auth/me before rendering any
 * protected route. `loading` covers that verification window so
 * ProtectedRoute doesn't bounce a still-valid session to /login.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) { setLoading(false); return }
    api.me()
      .then(setUser)
      .catch(() => { localStorage.removeItem(TOKEN_KEY) })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const { token, user: u } = await api.login(email, password)
    localStorage.setItem(TOKEN_KEY, token)
    setUser(u)
    return u
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }, [])

  const can = useCallback((permission) => hasPermission(user?.role, permission), [user])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}