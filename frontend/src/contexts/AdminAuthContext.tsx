import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, adminGetMe, adminLogin, type AdminDto } from '../lib/api'

const TOKEN_KEY = 'pavillon46_admin_token'
const ADMIN_KEY = 'pavillon46_admin'

interface AdminAuthContextValue {
  token: string | null
  admin: AdminDto | null
  loading: boolean
  login: (email: string, password: string) => Promise<AdminDto>
  logout: () => void
  setAdmin: (admin: AdminDto) => void
  applySession: (token: string, admin: AdminDto) => void
  refresh: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined)

function readStoredAdmin(): AdminDto | null {
  try {
    const raw = localStorage.getItem(ADMIN_KEY)
    return raw ? (JSON.parse(raw) as AdminDto) : null
  } catch {
    return null
  }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [admin, setAdminState] = useState<AdminDto | null>(() => readStoredAdmin())
  const [loading, setLoading] = useState<boolean>(() => !!localStorage.getItem(TOKEN_KEY))

  const persist = useCallback((nextToken: string | null, nextAdmin: AdminDto | null) => {
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken)
    else localStorage.removeItem(TOKEN_KEY)
    if (nextAdmin) localStorage.setItem(ADMIN_KEY, JSON.stringify(nextAdmin))
    else localStorage.removeItem(ADMIN_KEY)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setAdminState(null)
    persist(null, null)
  }, [persist])

  const setAdmin = useCallback((next: AdminDto) => {
    setAdminState(next)
    localStorage.setItem(ADMIN_KEY, JSON.stringify(next))
  }, [])

  const applySession = useCallback((nextToken: string, nextAdmin: AdminDto) => {
    setToken(nextToken)
    setAdminState(nextAdmin)
    persist(nextToken, nextAdmin)
  }, [persist])

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await adminLogin(email, password)
      setToken(result.token)
      setAdminState(result.admin)
      persist(result.token, result.admin)
      return result.admin
    },
    [persist],
  )

  const refresh = useCallback(async () => {
    const current = localStorage.getItem(TOKEN_KEY)
    if (!current) {
      setLoading(false)
      return
    }
    try {
      const fresh = await adminGetMe(current)
      setAdminState(fresh)
      localStorage.setItem(ADMIN_KEY, JSON.stringify(fresh))
    } catch (err) {
      // Only end the session on a real auth failure. Keep it through transient
      // network / 5xx errors so a flaky connection doesn't evict a valid session.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setToken(null)
        setAdminState(null)
        persist(null, null)
      }
    } finally {
      setLoading(false)
    }
  }, [persist])

  // Validate the stored token once on mount.
  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // End the session if any admin-area request 401s mid-session, so the user is
  // redirected to the login screen instead of being stranded on error banners.
  useEffect(() => {
    const onUnauthorized = (e: Event) => {
      const path = (e as CustomEvent<{ path?: string }>).detail?.path ?? ''
      if (path.includes('/api/admin') || path.includes('/api/activity')) logout()
    }
    window.addEventListener('pavillon46:unauthorized', onUnauthorized)
    return () => window.removeEventListener('pavillon46:unauthorized', onUnauthorized)
  }, [logout])

  const value = useMemo<AdminAuthContextValue>(
    () => ({ token, admin, loading, login, logout, setAdmin, applySession, refresh }),
    [token, admin, loading, login, logout, setAdmin, applySession, refresh],
  )

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within an AdminAuthProvider')
  return ctx
}
