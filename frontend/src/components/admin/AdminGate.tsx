import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { IMAGE_PATHS, animationVariants } from '../../lib/constants'
import { EASE_SMOOTH_OUT } from '../../lib/motion'

/**
 * Cinematic split layout for every admin auth screen (login, forgot, reset,
 * set-password). Left: the estate. Right: a calm cream desk. English-only,
 * matching the console's language.
 */
export default function AdminGate({
  title,
  subtitle,
  children,
  footer,
  loading = false,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
  footer?: ReactNode
  loading?: boolean
}) {
  return (
    <div className="adash-auth">
      <motion.aside
        className="adash-auth-visual"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.1, ease: EASE_SMOOTH_OUT }}
      >
        <div className="adash-auth-visual-media" aria-hidden="true" />
        <div className="adash-auth-visual-veil" aria-hidden="true" />
        <div className="adash-auth-visual-grain" aria-hidden="true" />

        <div className="adash-auth-visual-inner">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: EASE_SMOOTH_OUT }}
          >
            <Link to="/" className="adash-auth-visual-logo">
              <img src={IMAGE_PATHS.logo} alt="Pavillon 46" />
            </Link>
          </motion.div>

          <motion.div
            className="adash-auth-visual-center"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.35, ease: EASE_SMOOTH_OUT }}
          >
            <span className="adash-auth-visual-eyebrow">Admin console</span>
            <p className="adash-auth-visual-title">
              The <em>inner</em> rooms.
            </p>
            <p className="adash-auth-visual-desc">
              Members, referrals and the quiet pulse of the house — gathered at one desk.
            </p>
          </motion.div>

          <motion.div
            className="adash-auth-visual-foot"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.65, ease: EASE_SMOOTH_OUT }}
          >
            <span>Geneva · Confidential</span>
            <span>Pavillon 46</span>
          </motion.div>
        </div>
      </motion.aside>

      <main className="adash-auth-panel">
        <header className="adash-auth-panel-top">
          <Link to="/" className="adash-auth-back">View the house</Link>
          <span className="adash-auth-desk-mark">Private desk</span>
        </header>

        <div className="adash-auth-panel-body">
          {loading ? (
            <div className="adash-auth-splash" role="status" aria-live="polite">
              <span className="adash-auth-spinner" aria-hidden="true" />
              <p>Opening the console…</p>
            </div>
          ) : (
            <motion.div
              className="adash-auth-form"
              variants={animationVariants.form}
              initial="hidden"
              animate="visible"
            >
              <span className="adash-auth-form-eyebrow">Admin console</span>
              <h1>{title}</h1>
              {subtitle && <p className="adash-auth-sub">{subtitle}</p>}
              {children}
              {footer}
            </motion.div>
          )}
        </div>
      </main>
    </div>
  )
}
