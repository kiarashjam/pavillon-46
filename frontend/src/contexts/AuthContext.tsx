import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getMe, login as apiLogin, type MemberDto } from '../lib/api'

const TOKEN_KEY = 'pavillon46_member_token'
const MEMBER_KEY = 'pavillon46_member'

interface AuthContextValue {
  token: string | null
  member: MemberDto | null
  loading: boolean
  login: (email: string, password: string) => Promise<MemberDto>
  logout: () => void
  setMember: (member: MemberDto) => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function readStoredMember(): MemberDto | null {
  try {
    const raw = localStorage.getItem(MEMBER_KEY)
    return raw ? (JSON.parse(raw) as MemberDto) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [member, setMemberState] = useState<MemberDto | null>(() => readStoredMember())
  const [loading, setLoading] = useState<boolean>(() => !!localStorage.getItem(TOKEN_KEY))

  const persist = useCallback((nextToken: string | null, nextMember: MemberDto | null) => {
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken)
    else localStorage.removeItem(TOKEN_KEY)
    if (nextMember) localStorage.setItem(MEMBER_KEY, JSON.stringify(nextMember))
    else localStorage.removeItem(MEMBER_KEY)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setMemberState(null)
    persist(null, null)
  }, [persist])

  const setMember = useCallback(
    (next: MemberDto) => {
      setMemberState(next)
      localStorage.setItem(MEMBER_KEY, JSON.stringify(next))
    },
    [],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiLogin(email, password)
      setToken(result.token)
      setMemberState(result.member)
      persist(result.token, result.member)
      return result.member
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
      const fresh = await getMe(current)
      setMemberState(fresh)
      localStorage.setItem(MEMBER_KEY, JSON.stringify(fresh))
    } catch {
      // Token invalid / expired — clear the session.
      setToken(null)
      setMemberState(null)
      persist(null, null)
    } finally {
      setLoading(false)
    }
  }, [persist])

  // Validate the stored token once on mount.
  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ token, member, loading, login, logout, setMember, refresh }),
    [token, member, loading, login, logout, setMember, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
