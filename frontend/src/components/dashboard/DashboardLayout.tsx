import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useTranslations } from '../../lib/translations'
import { IMAGE_PATHS } from '../../lib/constants'
import { EASE_SMOOTH_OUT } from '../../lib/motion'

type IconProps = { className?: string }

const icons = {
  overview: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  referral: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M12 21s-7-4.35-9.5-8.5C1 9.5 2.5 6.5 5.5 6.5c2 0 3.2 1.2 3.8 2.2.6-1 1.8-2.2 3.8-2.2 3 0 4.5 3 3 6C19 16.65 12 21 12 21Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  referrals: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  profile: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  events: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  newsletter: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M4 6h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4V6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M19 8h1.5v10a2 2 0 0 1-2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 10h7M7 13h7M7 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
}

export default function DashboardLayout() {
  const { member, logout } = useAuth()
  const { language, changeLanguage } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const t = useTranslations(language, 'dashboard')
  const [navOpen, setNavOpen] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)

  // Track the mobile-drawer breakpoint.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const update = () => setIsNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // When the drawer is collapsed on mobile, take the off-canvas sidebar out of
  // the tab order / a11y tree so it isn't reachable behind the page.
  useEffect(() => {
    const el = sidebarRef.current
    if (!el) return
    if (isNarrow && !navOpen) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }, [isNarrow, navOpen])

  // Escape closes the open drawer.
  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen])

  // A member who still has a temporary password must reset it first.
  if (member?.mustChangePassword) {
    return <Navigate to="/set-password" replace />
  }

  const navItems = [
    { to: '/dashboard', label: t.navOverview, icon: icons.overview, end: true },
    { to: '/dashboard/newsletters', label: t.navNewsletters, icon: icons.newsletter, end: false },
    { to: '/dashboard/referral', label: t.navReferral, icon: icons.referral, end: false },
    { to: '/dashboard/referrals', label: t.navReferrals, icon: icons.referrals, end: false },
    { to: '/dashboard/profile', label: t.navProfile, icon: icons.profile, end: false },
  ]

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const fullName = member ? `${member.firstName} ${member.lastName}`.trim() : ''
  const initials = member
    ? `${member.firstName?.[0] ?? ''}${member.lastName?.[0] ?? ''}`.toUpperCase() || member.email[0]?.toUpperCase()
    : ''

  return (
    <div className="dash-shell">
      <div className="dash-ambient" aria-hidden="true" />

      <aside id="dash-sidebar" ref={sidebarRef} className={`dash-sidebar${navOpen ? ' is-open' : ''}`}>
        <Link to="/dashboard" className="dash-brand" onClick={() => setNavOpen(false)}>
          <img src={IMAGE_PATHS.logo} alt="Pavillon 46" className="dash-brand-logo" />
        </Link>

        <nav className="dash-nav">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `dash-nav-link${isActive ? ' is-active' : ''}`}
                onClick={() => setNavOpen(false)}
              >
                <Icon className="dash-nav-icon" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="dash-sidebar-foot">
          <div className="dash-member-chip">
            <span className="dash-member-chip-avatar">{initials}</span>
            <span className="dash-member-chip-info">
              <span className="dash-member-chip-name">{fullName || member?.email}</span>
              <span className="dash-member-chip-meta">{member?.referralCode}</span>
            </span>
          </div>

          <button type="button" className="dash-signout" onClick={handleLogout}>
            <svg viewBox="0 0 24 24" fill="none" className="dash-nav-icon" aria-hidden="true">
              <path d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5M14 5h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.signOut}</span>
          </button>
        </div>
      </aside>

      {navOpen && <div className="dash-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}

      <div className="dash-main">
        <header className="dash-topbar">
          <button
            type="button"
            className="dash-burger"
            onClick={() => setNavOpen((s) => !s)}
            aria-label="Menu"
            aria-expanded={navOpen}
            aria-controls="dash-sidebar"
          >
            <span /><span /><span />
          </button>

          <div className="dash-topbar-copy">
            <p className="dash-greeting">{t.greeting}</p>
            <p className="dash-membername">{fullName || member?.email}</p>
          </div>

          <div className="dash-topbar-actions">
            <div className="dash-lang" role="group" aria-label="Language">
              <button className={language === 'fr' ? 'is-active' : ''} onClick={() => changeLanguage('fr')}>FR</button>
              <span>|</span>
              <button className={language === 'en' ? 'is-active' : ''} onClick={() => changeLanguage('en')}>EN</button>
            </div>
            <button
              type="button"
              className="dash-avatar"
              title={fullName}
              aria-label={t.navProfile}
              onClick={() => navigate('/dashboard/profile')}
            >
              {initials}
            </button>
          </div>
        </header>

        <main className="dash-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE_SMOOTH_OUT }}
              className="dash-page"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
