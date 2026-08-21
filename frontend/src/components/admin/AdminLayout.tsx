import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { IMAGE_PATHS } from '../../lib/constants'
import { EASE_SMOOTH_OUT } from '../../lib/motion'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { AdminSplash } from './adminUi'
import { adminGreeting, adminInitials } from './adminHelpers'

export type AdminCtx = { token: string }

type Icon = (p: { className?: string }) => JSX.Element
const icons: Record<string, Icon> = {
  overview: (p) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  members: (p) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M16 7.5a3 3 0 0 1 0 5.6M16.5 14c2.5.4 4 2.3 4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  referrals: (p) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M12 21s-7-4.35-9.5-8.5C1 9.5 2.5 6.5 5.5 6.5c2 0 3.2 1.2 3.8 2.2.6-1 1.8-2.2 3.8-2.2 3 0 4.5 3 3 6C19 16.65 12 21 12 21Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  activity: (p) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M3 13h3l2.5-7 4 14L18 8l1.5 5H22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  newsletter: (p) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m4 6 8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 6v3l-3-3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
}

const SECTIONS: Record<string, { title: string; sub: string }> = {
  '/admin': { title: 'Overview', sub: 'A live snapshot of the house' },
  '/admin/people': { title: 'People', sub: 'Admins, members and submitters' },
  '/admin/members': { title: 'People', sub: 'Admins, members and submitters' },
  '/admin/referrals': { title: 'People', sub: 'Admins, members and submitters' },
  '/admin/activity': { title: 'Activity', sub: 'Site analytics & engagement' },
  '/admin/newsletters': { title: 'Newsletters', sub: 'Write, publish, send.' },
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { token, admin, loading, logout } = useAdminAuth()
  const [navOpen, setNavOpen] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)')
    const update = () => setIsNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Keep the off-canvas drawer out of the tab order / a11y tree when collapsed on mobile.
  useEffect(() => {
    const el = sidebarRef.current
    if (!el) return
    if (isNarrow && !navOpen) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }, [isNarrow, navOpen, token])

  // Close the drawer on navigation.
  useEffect(() => { setNavOpen(false) }, [location.pathname])

  if (loading) return <AdminSplash />

  // Not signed in → the dedicated admin login. Force the first-login reset.
  if (!token) return <Navigate to="/admin/login" replace />
  if (admin?.mustChangePassword) return <Navigate to="/admin/set-password" replace />

  const navItems: { to: string; label: string; icon: Icon; end: boolean; also?: string[] }[] = [
    { to: '/admin', label: 'Overview', icon: icons.overview, end: true },
    { to: '/admin/people', label: 'People', icon: icons.members, end: false, also: ['/admin/members', '/admin/referrals'] },
    { to: '/admin/newsletters', label: 'Newsletters', icon: icons.newsletter, end: false },
    { to: '/admin/activity', label: 'Activity', icon: icons.activity, end: false },
  ]
  const sectionKey = location.pathname.startsWith('/admin/newsletters') ? '/admin/newsletters' : location.pathname
  const section = SECTIONS[sectionKey] ?? SECTIONS['/admin']
  const adminName = [admin?.firstName, admin?.lastName].filter(Boolean).join(' ') || admin?.email || 'Admin'
  const initials = adminInitials(admin?.firstName, admin?.lastName, admin?.email)
  const greeting = adminGreeting()

  return (
    <div className="adash">
      <div className="adash-ambient" aria-hidden="true" />
      <div className="adash-grain" aria-hidden="true" />

      <aside id="adash-sidebar" ref={sidebarRef} className={`adash-sidebar${navOpen ? ' is-open' : ''}`}>
        <Link to="/admin" className="adash-brand" onClick={() => setNavOpen(false)}>
          <img src={IMAGE_PATHS.logo} alt="Pavillon 46" />
          <span className="adash-brand-tag">Admin</span>
        </Link>
        <nav className="adash-nav">
          {navItems.map((item) => {
            const Ico = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => {
                  const extra = item.also?.some((p) => location.pathname === p)
                  return `adash-nav-link${isActive || extra ? ' is-active' : ''}`
                }}
                onClick={() => setNavOpen(false)}
              >
                <Ico className="adash-nav-ico" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
        <div className="adash-side-foot">
          <div className="adash-side-user">
            <span className="adash-ava adash-ava-lg" aria-hidden="true">{initials}</span>
            <span className="adash-person-info">
              <span className="adash-person-name">{adminName}</span>
              <span className="adash-person-sub">{admin?.email}</span>
            </span>
          </div>
          <button type="button" className="adash-signout" onClick={logout}>
            <svg viewBox="0 0 24 24" fill="none" className="adash-nav-ico" aria-hidden="true">
              <path d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5M14 5h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {navOpen && <div className="adash-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}

      <div className="adash-main">
        <header className="adash-topbar">
          <button type="button" className="adash-burger" aria-label="Menu" aria-expanded={navOpen} aria-controls="adash-sidebar" onClick={() => setNavOpen((s) => !s)}>
            <span /><span /><span />
          </button>
          <div className="adash-topbar-title">
            <p className="adash-topbar-greet">{greeting}</p>
            <h1>{section.title}</h1>
            <p>{section.sub}</p>
          </div>
          <div className="adash-topbar-actions">
            <a className="adash-storage-pill" href="/" target="_blank" rel="noopener noreferrer">View site ↗</a>
            <button type="button" className="adash-btn adash-btn-ghost adash-btn-sm" onClick={() => navigate('/')}>Exit</button>
            <span className="adash-whoami" title={admin?.email}>
              <span className="adash-ava" aria-hidden="true">{initials}</span>
              <span className="adash-whoami-name">{adminName}</span>
            </span>
          </div>
        </header>

        <main className="adash-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: EASE_SMOOTH_OUT }}
              className="adash-page"
            >
              <Outlet context={{ token } satisfies AdminCtx} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
