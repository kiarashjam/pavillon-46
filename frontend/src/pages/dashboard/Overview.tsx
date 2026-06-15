import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useTranslations } from '../../lib/translations'
import { animationVariants } from '../../lib/constants'
import { getMyReferrals, type ApplicantDto } from '../../lib/api'

export default function Overview() {
  const { member, token } = useAuth()
  const { language } = useLanguage()
  const navigate = useNavigate()
  const t = useTranslations(language, 'dashboard')

  const [applicants, setApplicants] = useState<ApplicantDto[]>([])
  const [stats, setStats] = useState<{ total: number; pending: number; freeMonths: number } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    if (!token) return
    getMyReferrals(token)
      .then((refs) => {
        if (!active) return
        setApplicants(refs.applicants)
        setStats({ total: refs.total, pending: refs.pending, freeMonths: refs.accepted })
      })
      .catch(() => {
        /* fall back to member fields below */
      })
    return () => {
      active = false
    }
  }, [token])

  if (!member) return null

  const salutation = member.title
    ? `${member.title} ${member.lastName}`.trim()
    : member.firstName || member.email

  const total = stats?.total ?? member.referralCount
  const pending = stats?.pending ?? Math.max(0, member.referralCount - member.successfulReferrals)
  // Each successful (signed) referral earns one free month.
  const freeMonths = stats?.freeMonths ?? member.successfulReferrals

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(member.referralCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable */
    }
  }

  const statusLabel = (status: ApplicantDto['status']) =>
    status === 'reviewing' ? t.statusReviewing
      : status === 'accepted' ? t.statusAccepted
      : status === 'declined' ? t.statusDeclined
      : t.statusPending

  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(language === 'fr' ? 'fr-CH' : 'en-GB')
  }

  const recent = applicants.slice(0, 5)

  return (
    <motion.div variants={animationVariants.container} initial="hidden" animate="visible" className="dash-stack">
      {/* Welcome hero */}
      <motion.section variants={animationVariants.item} className="dash-hero">
        <div className="dash-hero-media" aria-hidden="true" />
        <div className="dash-hero-veil" aria-hidden="true" />
        <div className="dash-hero-content">
          <span className="dash-hero-eyebrow">{t.memberLabel}</span>
          <h1 className="dash-hero-title">
            {t.welcomeHeading} <em>{salutation}</em>
          </h1>
          <p className="dash-hero-sub">{t.welcomeSub}</p>
          <span className="dash-hero-meta">{t.openingTitle}</span>
        </div>
      </motion.section>

      {/* Stats */}
      <motion.div variants={animationVariants.item} className="dash-stat-grid">
        <div className="dash-stat-card">
          <span className="dash-stat-label">{t.statReferrals}</span>
          <strong className="dash-stat-value">{total}</strong>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-label">{t.statusPending}</span>
          <strong className="dash-stat-value">{pending}</strong>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-label">{t.statBonus}</span>
          <strong className="dash-stat-value">{freeMonths}</strong>
        </div>
      </motion.div>

      {/* Referral CTA + code */}
      <div className="dash-two-col">
        <motion.div variants={animationVariants.item} className="dash-feature-card dash-cta-card">
          <h2>{t.referralCardTitle}</h2>
          <p>{t.referralCardText}</p>
          <button type="button" className="dash-btn dash-btn-primary" onClick={() => navigate('/dashboard/referral')}>
            {t.referralCardButton}
          </button>
        </motion.div>

        <motion.div variants={animationVariants.item} className="dash-code-card">
          <div>
            <span className="dash-card-eyebrow">{t.yourCode}</span>
            <p className="dash-code-value">{member.referralCode}</p>
          </div>
          <button
            type="button"
            className="dash-btn dash-btn-ghost"
            aria-label={copied ? t.copied : `${t.copy} — ${member.referralCode}`}
            onClick={copyCode}
          >
            {copied ? t.copied : t.copy}
          </button>
          <span className="sr-only" role="status" aria-live="polite">{copied ? t.copied : ''}</span>
        </motion.div>
      </div>

      {/* Recent referrals */}
      <motion.section variants={animationVariants.item} className="dash-panel" aria-labelledby="dash-recent-h">
        <div className="dash-section-head">
          <h2 id="dash-recent-h">{t.referralsTitle}</h2>
          <Link to="/dashboard/referrals" className="dash-section-link">{t.totalLabel} · {total}</Link>
        </div>
        {recent.length === 0 ? (
          <p className="dash-empty">{t.referralsEmpty}</p>
        ) : (
          <ul className="dash-mini-list" role="list">
            {recent.map((a) => (
              <li key={a.id} className="dash-mini-row">
                <span className="dash-mini-info">
                  <span className="dash-mini-name">{`${a.firstName} ${a.lastName}`.trim()}</span>
                  <span className="dash-mini-sub">{fmtDate(a.createdAt)}</span>
                </span>
                <span className={`dash-pill is-${a.status}`}>{statusLabel(a.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </motion.section>
    </motion.div>
  )
}
