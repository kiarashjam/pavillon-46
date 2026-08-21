import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import ReactMarkdown, { type Components } from 'react-markdown'
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

/** How long the re-subscribe confirmation stays on screen. */
const OPT_IN_FLASH_MS = 6000

/* The three inline style objects that used to live here — the card link's
 * `color: inherit`, the stretched hit overlay, and the detail cover's explicit
 * 5:2 ratio — are now carried by `.dash-newsletter-card-link`,
 * `.dash-newsletter-card-hit` and `.dash-newsletter-detail-cover` in
 * dashboard.css with identical values, so the rendered result is unchanged.
 *
 * The one that is load-bearing and easy to undo from the stylesheet side: the
 * detail cover needs `aspect-ratio: 5 / 2` AND `height: auto` together. The
 * width/height attributes below are a presentational hint that beats the ratio
 * on its own, and without the ratio the rendered height comes from the loaded
 * file, which is the article jump the attributes were meant to prevent.
 */

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

/** True when the visitor asked the OS to reduce motion. Read at call time, not
 *  cached, so a mid-session change to the setting is honoured. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Scroll the page back to the top when moving into a newsletter — animated,
 *  unless the visitor asked for reduced motion, in which case a programmatic
 *  smooth scroll is precisely the movement that setting is about. */
function scrollToPageTop(): void {
  if (typeof window === 'undefined') return
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
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

/** Smallest ATX heading level used in a markdown body (1–6), or 0 when the body
 *  has no heading at all. Deliberately approximate, like stripMarkdown above: a
 *  `# comment` line inside a fenced code block can fool it, which only ever
 *  shifts the real headings one level deeper — never into an invalid outline.
 *  Pure function. */
function topHeadingLevel(body: string): number {
  const pattern = /^[ \t]{0,3}(#{1,6})[ \t]+\S/gm
  let top = 0
  let match = pattern.exec(body)
  while (match) {
    const level = match[1].length
    if (top === 0 || level < top) top = level
    match = pattern.exec(body)
  }
  return top
}

/** ReactMarkdown overrides that keep the body's headings *below* the detail
 *  title. Bare ReactMarkdown emits whatever level the admin typed, so a body
 *  opening with `#` rendered an `<h1>` nested inside the `<h2>` article — an
 *  invalid document outline and a nonsensical heading list for screen readers.
 *
 *  The body's own top level becomes `<h3>` (one step under the `<h2>` title)
 *  and deeper headings keep their relative depth, clamped at `<h6>`: a body
 *  written `##` / `###` therefore reads h3 / h4 with no skipped level, and one
 *  written `#` / `##` reads the same. */
function shiftedHeadings(body: string): Components {
  const top = topHeadingLevel(body) || 1
  // A tag name is a valid override and ReactMarkdown renders it directly — no
  // wrapper component, so nothing remounts and no mdast `node` prop ever leaks
  // onto the DOM element.
  const tag = (level: number) =>
    `h${Math.min(6, Math.max(3, 3 + level - top))}` as 'h3' | 'h4' | 'h5' | 'h6'
  return { h1: tag(1), h2: tag(2), h3: tag(3), h4: tag(4), h5: tag(5), h6: tag(6) }
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
  // Bumped by the retry button to re-run the load effect below.
  const [reloadNonce, setReloadNonce] = useState(0)

  // Re-subscribe ("opt back in") state for the unsubscribed banner.
  const [optInPending, setOptInPending] = useState(false)
  const [optInError, setOptInError] = useState<string | null>(null)
  // `optInDone` is sticky — once the POST succeeded the member is subscribed
  // again for the rest of the visit. `optInFlash` is only the confirmation
  // message, which dismisses itself; the two used to be one flag, so the
  // confirmation sat under the page until a reload.
  const [optInDone, setOptInDone] = useState(false)
  const [optInFlash, setOptInFlash] = useState(false)

  // Focus bookkeeping for the list <-> detail transition. Both are read from an
  // effect after the commit that swapped the two views, so the target element
  // already exists.
  const detailTitleRef = useRef<HTMLHeadingElement | null>(null)
  const cardLinkRefs = useRef(new Map<string, HTMLAnchorElement>())
  // Seeded with the id present on mount, so arriving straight at ?id=... (a
  // shared link) does not yank focus out of the document start.
  const prevActiveIdRef = useRef<string | null>(activeId)

  // Re-fetch whenever the language changes so title/body reflect the choice,
  // and whenever the member asks for a retry.
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
  }, [token, language, reloadNonce, t.loadError])

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

  // Move focus deliberately across the list <-> detail boundary. Without this
  // the swap leaves focus on <body>: a keyboard visitor who opened a newsletter
  // had to tab from the top of the page again, and closing it dropped them
  // nowhere near the card they came from.
  useEffect(() => {
    const previousId = prevActiveIdRef.current
    if (previousId === activeId) return
    prevActiveIdRef.current = activeId
    if (activeId) {
      // Opening (or switching issues): scroll the article into view ourselves
      // and put focus on its heading, so the next Tab starts inside the piece.
      scrollToPageTop()
      detailTitleRef.current?.focus({ preventScroll: true })
      return
    }
    // Closing: back to the card the member came from. Absent when the id was
    // stale (the effect above drops those), in which case focus stays put.
    if (previousId) cardLinkRefs.current.get(previousId)?.focus()
  }, [activeId])

  // The confirmation is a flash, not a state.
  useEffect(() => {
    if (!optInFlash) return
    const timer = window.setTimeout(() => setOptInFlash(false), OPT_IN_FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [optInFlash])

  /** Same route with `?id=` set. A real URL is what makes the card title a real
   *  link — middle-click, ⌘-click and "copy link address" all work again. */
  const detailHref = (id: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('id', id)
    return `?${next.toString()}`
  }

  const backToList = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('id')
    setSearchParams(next)
  }

  const retryLoad = () => setReloadNonce((n) => n + 1)

  const resubscribe = async () => {
    if (!token || optInPending) return
    setOptInPending(true)
    setOptInError(null)
    try {
      await memberOptInNewsletters(token)
      setOptInDone(true)
      setOptInFlash(true)
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

  // A polite live region only announces reliably when it was already in the DOM
  // before its text changed, so one always-mounted, screen-reader-only span
  // carries every non-error status change on this page. Failures get their own
  // role="alert" at the point they render.
  const announcement = loading ? t.loading : optInFlash ? t.newslettersOptInSuccess : ''

  const bodyComponents = useMemo(() => shiftedHeadings(active?.body ?? ''), [active?.body])

  return (
    <motion.div
      variants={animationVariants.container}
      initial="hidden"
      animate="visible"
      className="dash-stack"
      aria-busy={loading}
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

      {/* .sr-only is position:absolute, so this never adds a row to the flex
          stack — it exists purely to keep the live region mounted. */}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      {loading && <p className="dash-muted-line">{t.loading}</p>}

      {error && !loading && (
        <motion.section variants={animationVariants.item} className="dash-panel">
          <div className="dash-form-actions">
            <p className="dash-error" role="alert">
              {error}
            </p>
            <button type="button" className="dash-btn dash-btn-ghost" onClick={retryLoad}>
              {t.newslettersRetry}
            </button>
          </div>
        </motion.section>
      )}

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
              // No lazy loading here: on a page whose whole point is this one
              // newsletter the cover is above the fold, so deferring it only
              // delays the first paint. The list cards below keep loading="lazy".
              decoding="async"
              // Intrinsic size hint, 5:2 — the same ratio
              // `.dash-newsletter-detail-cover` pins in CSS, so the reserved
              // box survives the image loading. Keep the two in step.
              width={1200}
              height={480}
              // A cover that will not load is hidden, not swapped for a
              // placeholder: the old fallback pointed at
              // /images/newsletter-cover-default.jpg, which is not in
              // public/images, so a broken URL became a *second* broken image.
              // The surrounding layout already handles a coverless issue —
              // that is what a member sees when none was chosen.
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          )}

          <header className="dash-newsletter-detail-head">
            <div className="dash-newsletter-meta">
              {/* The tag is editorial copy typed per newsletter in the admin
                  editor — free text, an open set ("hiver", "harvest supper"),
                  not UI chrome — so it is shown verbatim and deliberately not
                  routed through translations: there is no vocabulary to map.
                  Note for the copy owner: the model keeps ONE tag for both
                  languages (Newsletter.Tag, "short lowercase English phrase"),
                  so a French member reads whatever the admin typed. Making it
                  bilingual needs a TagFr/TagEn pair server-side, not a lookup
                  table here. Skip the pill when empty — it would render as a
                  bare coloured chip. */}
              {active.tag?.trim() && <span className="dash-pill dash-newsletter-tag">{active.tag.trim()}</span>}
              <span className="dash-newsletter-date">
                {t.newslettersPublishedOn.replace('{date}', formatDate(active.date, language))}
              </span>
            </div>
            {/* tabIndex={-1} makes the heading a focus target for the effect
                above; it stays out of the tab order. */}
            <h2 id="dash-nl-detail-title" ref={detailTitleRef} tabIndex={-1}>
              {active.title}
            </h2>
          </header>

          <div className="dash-newsletter-body">
            <ReactMarkdown components={bodyComponents}>{active.body}</ReactMarkdown>
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
          <motion.section variants={animationVariants.item} className="dash-newsletter-grid" aria-label={t.newslettersListLabel}>
            {items.map((n) => (
              <article key={n.id} className="dash-newsletter-card" aria-labelledby={`nl-card-${n.id}`}>
                {n.coverImageUrl && (
                  <img
                    className="dash-newsletter-cover"
                    src={n.coverImageUrl}
                    alt=""
                    loading="lazy"
                    // Same as the detail cover: hide rather than swap in a
                    // placeholder file that does not exist.
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                )}

                <div className="dash-newsletter-card-body">
                  <div className="dash-newsletter-meta">
                    {/* Verbatim editorial tag — see the note in the detail view. */}
                    {n.tag?.trim() && <span className="dash-pill dash-newsletter-tag">{n.tag.trim()}</span>}
                    <span className="dash-newsletter-date">{formatDate(n.date, language)}</span>
                  </div>
                  {/* The title is the card's one link, and the only focusable
                      thing in it: the heading stays a heading (so the list can
                      be scanned by heading), the accessible name is the title
                      alone instead of tag + date + title + excerpt + "Read",
                      and the stretched overlay inside the link keeps the whole
                      card clickable without a second tab stop. */}
                  <h3 className="dash-newsletter-title" id={`nl-card-${n.id}`}>
                    <Link
                      to={detailHref(n.id)}
                      className="dash-newsletter-card-link"
                      ref={(el) => {
                        const refs = cardLinkRefs.current
                        if (el) refs.set(n.id, el)
                        else refs.delete(n.id)
                      }}
                    >
                      {n.title}
                      <span className="dash-newsletter-card-hit" aria-hidden="true" />
                    </Link>
                  </h3>
                  <p className="dash-newsletter-excerpt">{excerpt(n.body)}</p>
                  {/* Visual affordance only — the title link above is the
                      action, so this is hidden from assistive tech rather than
                      read out as a second, unlabelled "Read". */}
                  <span className="dash-newsletter-read" aria-hidden="true">
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

      {/* Subscription preference, last on the page. It used to sit directly
          under the hero, which made an opt-out setting the second thing an
          unsubscribed member read on every visit, ahead of the newsletters
          they came for. */}
      {(showUnsubscribedBanner || optInFlash) && (
        <motion.section variants={animationVariants.item} className="dash-panel dash-newsletter-banner">
          {showUnsubscribedBanner ? (
            <>
              <div className="dash-form-actions">
                <p>{t.newslettersUnsubscribed}</p>
                {/* The label names the action even while the POST is in flight
                    — it used to swap to t.loading ("Chargement…"), which
                    described nothing the member had asked for. `disabled` plus
                    aria-busy carry the pending state instead. A dedicated
                    `newslettersResubscribing` key would say it better still. */}
                <button
                  type="button"
                  className="dash-btn dash-btn-ghost"
                  onClick={() => void resubscribe()}
                  disabled={optInPending}
                  aria-busy={optInPending}
                >
                  {t.newslettersResubscribe}
                </button>
              </div>
              {optInError && (
                // Inline spacing only: the banner stylesheet zeroes <p> margins.
                <p className="dash-error" role="alert" style={{ marginTop: 12 }}>
                  {optInError}
                </p>
              )}
            </>
          ) : (
            // Announced through the live region above, so no role here — that
            // would read the same sentence twice.
            <p className="dash-saved-flash">{t.newslettersOptInSuccess}</p>
          )}
        </motion.section>
      )}
    </motion.div>
  )
}
