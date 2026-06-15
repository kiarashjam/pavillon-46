import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useTranslations } from '../../lib/translations'
import { animationVariants } from '../../lib/constants'
import { getMyReferrals, type MemberReferralsResponse, type ApplicantDto } from '../../lib/api'

export default function MyReferrals() {
  const { token } = useAuth()
  const { language } = useLanguage()
  const t = useTranslations(language, 'dashboard')
  const [data, setData] = useState<MemberReferralsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!token) return
    setLoading(true)
    getMyReferrals(token)
      .then((res) => {
        if (active) setData(res)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : t.loadError)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token, t.loadError])

  const statusLabel = (status: ApplicantDto['status']) => {
    switch (status) {
      case 'reviewing':
        return t.statusReviewing
      case 'accepted':
        return t.statusAccepted
      case 'declined':
        return t.statusDeclined
      default:
        return t.statusPending
    }
  }

  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(language === 'fr' ? 'fr-CH' : 'en-GB')
  }

  return (
    <motion.div variants={animationVariants.container} initial="hidden" animate="visible" className="dash-stack">
      <motion.header variants={animationVariants.item} className="dash-pagehead">
        <h1>{t.referralsTitle}</h1>
        <p>{t.referralsSubtitle}</p>
      </motion.header>

      {data && (
        <motion.div variants={animationVariants.item} className="dash-stat-grid">
          <div className="dash-stat-card"><span className="dash-stat-label">{t.totalLabel}</span><strong className="dash-stat-value">{data.total}</strong></div>
          <div className="dash-stat-card"><span className="dash-stat-label">{t.statusPending}</span><strong className="dash-stat-value">{data.pending}</strong></div>
          <div className="dash-stat-card"><span className="dash-stat-label">{t.acceptedLabel}</span><strong className="dash-stat-value">{data.accepted}</strong></div>
        </motion.div>
      )}

      {loading && <p className="dash-muted-line">{t.loading}</p>}
      {error && <p className="dash-error">{error}</p>}

      {!loading && !error && data && (
        <motion.div variants={animationVariants.item} className="dash-table-card">
          {data.applicants.length === 0 ? (
            <p className="dash-empty">{t.referralsEmpty}</p>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>{t.colName}</th>
                    <th>{t.colContact}</th>
                    <th>{t.colDate}</th>
                    <th>{t.colStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.applicants.map((a) => (
                    <tr key={a.id}>
                      <td>{`${a.firstName} ${a.lastName}`.trim()}</td>
                      <td>{a.email || a.phone || '—'}</td>
                      <td>{fmtDate(a.createdAt)}</td>
                      <td><span className={`dash-pill is-${a.status}`}>{statusLabel(a.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}
