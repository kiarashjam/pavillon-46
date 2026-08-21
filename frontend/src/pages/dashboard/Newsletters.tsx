import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useTranslations } from '../../lib/translations'
import { animationVariants } from '../../lib/constants'
import {
  getMemberNewsletters,
  memberOptInNewsletters,
  type MemberNewsletterDto,
} from '../../lib/api'

/** Rough preview length used for the card body excerpt. */
const PREVIEW_CHARS = 200

/** Localized date formatting, matches the rest of the dashboard. */
function formatDate(iso: string, language: 'fr' | 'en'): string {
  if (!iso) return '—'
  const raw = iso.length === 10 ? `${iso}T00:00:00Z` : iso
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(language === 'fr' ? 'fr-CH' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** Strip the common Markdown syntax out of a body so a post starting with
 *  `## Titre` or `**Gras**` doesn't leak literal markers into the card preview.
 *
 *  Display-only and deliberately approximate: the result is never stored, sent
 *  back, or re-parsed — the detail view still renders the untouched body through
 *  ReactMarkdown. Order matters, see the comments. Pure function. */
function stripMarkdown(body: string): string {
  return (
    body
      // Images vanish entirely; links keep their label. Images first, so the
      // leading `!` of `![alt](url)` can't be left behind by the link rule.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Code fences and inline code backticks.
      .replace(/```[^\n`]*/g, '')
      .replace(/`/g, '')
      // Horizontal rules (`---`, `***`, `___`) — before the emphasis rules,
      // which would otherwise chew on them.
      .replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '')
      // Line-leading block markers: ATX headings, blockquotes, bullet and
      // ordered list markers.
      .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
      .replace(/^[ \t]*>[ \t]?/gm, '')
      .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, '')
      // Paired emphasis, bold before italic. The `_` variants only count at a
      // word boundary — as in Markdown itself — so a snake_case_name in the
      // body keeps its underscores.
      .replace(/\*\*([\s\S]*?)\*\*/g, '$1')
      .replace(/(^|[^\w])__([\s\S]*?)__(?!\w)/g, '$1$2')
      .replace(/\*([^\n*]+?)\*/g, '$1')
      .replace(/(^|[^\w])_([^\n_]+?)_(?!\w)/g, '$1$2')
      // Asterisks that never paired up are noise; unpaired underscores are left
      // alone rather than risk mangling a word.
      .replace(/\*/g, '')
  )
}

/** Build a short excerpt of the body — first ~200 characters, cut on a word
 *  boundary, ellipsis appended when it was actually clipped. */
function excerpt(body: string, max = PREVIEW_CHARS): string {
  if (!body) return ''
  // Flatten paragraphs / markdown syntax noise for the preview only.
  const flat = stripMarkdown(body).replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const clipped = flat.slice(0, max)
  const lastSpace = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`
}

export default function Newsletters() {
  const { token, member, refresh } = useAuth()
  const { language } = useLanguage()
  const t = useTranslations(language, 'dashboard')
  const [searchParams, setSearchParams] = useSearchParams()
  const activeId = searchParams.get('id')

  const [items, setItems] = useState<MemberNewsletterDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Re-subscribe ("opt back in") state for the unsubscribed banner.
  const [optInPending, setOptInPending] = useState(false)
  const [optInError, setOptInError] = useState<string | null>(null)
  const [optInDone, setOptInDone] = useState(false)

  // Re-fetch whenever the language changes so title/body reflect the choice.
  useEffect(() => {
    let active = true
    if (!token) return
    setLoading(true)
    setError(null)
    getMemberNewsletters(token, language)
      .then((res) => {
        if (!active) return
        setItems(res.newsletters ?? [])
      })
      .catch((err) => {
        if (!active) return
        // Never surface the raw upstream message — it is English-only and can
        // carry internal detail. Localized copy for the member, raw for us.
        console.error('[newsletters] load failed', err)
        setError(t.loadError)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token, language, t.loadError])

  // If a stale ?id=... points at something no longer in the list, drop it so
  // the list view shows normally instead of a blank detail state.
  useEffect(() => {
    if (!activeId) return
    if (loading) return
    if (items.some((n) => n.id === activeId)) return
    const next = new URLSearchParams(searchParams)
    next.delete('id')
    setSearchParams(next, { replace: true })
  }, [activeId, items, loading, searchParams, setSearchParams])

  const active = useMemo(
    () => (activeId ? items.find((n) => n.id === activeId) ?? null : null),
    [activeId, items],
  )

  const openDetail = (id: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('id', id)
    setSearchParams(next)
    // Bring the top of the page into view when moving into detail.
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const backToList = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('id')
    setSearchParams(next)
  }

  const resubscribe = async () => {
    if (!token || optInPending) return
    setOptInPending(true)
    setOptInError(null)
    try {
      await memberOptInNewsletters(token)
      setOptInDone(true)
      // Pull the member down again so the stored `newsletterOptOut` flag (and
      // every other view reading it) reflects the change.
      await refresh()
    } catch (err) {
      console.error('[newsletters] opt-in failed', err)
      // A write failure needs its own copy — reusing loadError would tell the
      // member we "couldn't load data" when the read actually succeeded.
      setOptInError(t.newslettersOptInError)
    } finally {
      setOptInPending(false)
    }
  }

  // Once the opt-in POST has succeeded the member is subscribed again, even if
  // the follow-up member refresh failed — so the local flag wins over the DTO.
  const showUnsubscribedBanner = member?.newsletterOptOut === true && !optInDone

  return (
    <motion.div
      variants={animationVariants.container}
      initial="hidden"
      animate="visible"
      className="dash-stack"
    >
      <motion.section variants={animationVariants.item} className="dash-hero dash-hero--slim">
        {/* .dash-hero sets color:#fff, so it needs these two layers to supply the
            dark backdrop. Without them the title renders white-on-cream and is
            effectively invisible — see Overview.tsx for the same pairing. */}
        <div className="dash-hero-media" aria-hidden="true" />
        <div className="dash-hero-veil" aria-hidden="true" />
        <div className="dash-hero-content">
          <span className="dash-hero-eyebrow">{t.newslettersEyebrow}</span>
          <h1 className="dash-hero-title">{t.newslettersTitle}</h1>
          <p className="dash-hero-sub">{t.newslettersSubtitle}</p>
        </div>
      </motion.section>

      {(showUnsubscribedBanner || optInDone) && (
        <motion.section variants={animationVariants.item} className="dash-panel dash-newsletter-banner" role="status">
          {showUnsubscribedBanner ? (
            <>
              <div className="dash-form-actions">
                <p>{t.newslettersUnsubscribed}</p>
                <button
                  type="button"
                  className="dash-btn dash-btn-ghost"
                  onClick={() => void resubscribe()}
                  disabled={optInPending}
                >
                  {optInPending ? t.loading : t.newslettersResubscribe}
                </button>
              </div>
              {optInError && (
                // Inline spacing only: the banner stylesheet zeroes <p> margins.
                <p className="dash-error" style={{ marginTop: 12 }}>
                  {optInError}
                </p>
              )}
            </>
          ) : (
            <p className="dash-saved-flash">{t.newslettersOptInSuccess}</p>
          )}
        </motion.section>
      )}

      {loading && <p className="dash-muted-line">{t.loading}</p>}
      {error && !loading && <p className="dash-error">{error}</p>}

      {!loading && !error && active ? (
        // Detail view — full markdown body.
        <motion.article variants={animationVariants.item} className="dash-newsletter-detail" aria-labelledby="dash-nl-detail-title">
          <button type="button" className="dash-newsletter-back" onClick={backToList}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.newslettersBack}</span>
          </button>

          {active.coverImageUrl && (
            <img
              className="dash-newsletter-detail-cover"
              src={active.coverImageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              // Intrinsic size hint only — CSS drives the rendered box. It
              // reserves the space so the body below doesn't jump on load.
              width={1200}
              height={480}
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement
                if (!img.dataset.fallback) {
                  img.dataset.fallback = '1'
                  img.src = '/images/newsletter-cover-default.jpg'
                }
              }}
            />
          )}

          <header className="dash-newsletter-detail-head">
            <div className="dash-newsletter-meta">
              {/* Skip the pill entirely when there is no tag — an empty one
                  renders as a bare coloured chip. */}
              {active.tag?.trim() && <span className="dash-pill dash-newsletter-tag">{active.tag.trim()}</span>}
              <span className="dash-newsletter-date">
                {t.newslettersDatePrefix} {formatDate(active.date, language)}
              </span>
            </div>
            <h2 id="dash-nl-detail-title">{active.title}</h2>
          </header>

          <div className="dash-newsletter-body">
            <ReactMarkdown>{active.body}</ReactMarkdown>
          </div>
        </motion.article>
      ) : !loading && !error ? (
        // List view — one card per newsletter.
        items.length === 0 ? (
          <motion.section variants={animationVariants.item} className="dash-panel">
            <p className="dash-empty">
              <strong>{t.newslettersEmptyTitle}</strong>
              <br />
              <span className="dash-mini-sub">{t.newslettersEmptyHint}</span>
            </p>
          </motion.section>
        ) : (
          <motion.section variants={animationVariants.item} className="dash-newsletter-grid" aria-label={t.newslettersTitle}>
            {items.map((n) => (
              <article
                key={n.id}
                className="dash-newsletter-card"
                role="button"
                tabIndex={0}
                onClick={() => openDetail(n.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openDetail(n.id)
                  }
                }}
              >
                {n.coverImageUrl && (
                  <img
                    className="dash-newsletter-cover"
                    src={n.coverImageUrl}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      const img = e.currentTarget as HTMLImageElement
                      if (!img.dataset.fallback) {
                        img.dataset.fallback = '1'
                        img.src = '/images/newsletter-cover-default.jpg'
                      }
                    }}
                  />
                )}

                <div className="dash-newsletter-card-body">
                  <div className="dash-newsletter-meta">
                    {n.tag?.trim() && <span className="dash-pill dash-newsletter-tag">{n.tag.trim()}</span>}
                    <span className="dash-newsletter-date">{formatDate(n.date, language)}</span>
                  </div>
                  <h3 className="dash-newsletter-title">{n.title}</h3>
                  <p className="dash-newsletter-excerpt">{excerpt(n.body)}</p>
                  {/* Presentational affordance only: the whole card is the
                      button (role/tabIndex/onKeyDown above), so this carries no
                      handler of its own — nothing clickable-but-unfocusable. */}
                  <span className="dash-newsletter-read">
                    {t.newslettersReadMore}
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>
              </article>
            ))}
          </motion.section>
        )
      ) : null}
    </motion.div>
  )
}
