import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import {
  adminListNewsletters,
  type AdminNewslettersResponse,
  type NewsletterDto,
} from '../../lib/api'
import { useLanguage } from '../../contexts/LanguageContext'
import { useTranslations, type DashboardTranslations } from '../../lib/translations'
import type { AdminCtx } from '../../components/admin/AdminLayout'
import { AdminEmpty, AdminSkeletonRows } from '../../components/admin/adminUi'

type StatusFilter = 'all' | NewsletterDto['status']

/**
 * The few strings this page needs that the shared dictionary does not carry
 * yet: the page heading, the search/filter affordances, the per-row date
 * qualifiers, the status pill labels (the dictionary's filter labels are
 * plurals — "Brouillons" — so they cannot double as a single row's pill), and
 * the *filtered*-to-nothing empty state (distinct from the true empty state,
 * which the dictionary does cover). Everything else comes from
 * `useTranslations(language, 'dashboard')`.
 */
const LOCAL = {
  fr: {
    heading: 'Infolettres',
    lede: 'Textes courts pour vos membres.',
    searchLabel: 'Rechercher une infolettre',
    searchPlaceholder: 'Rechercher un titre ou une rubrique…',
    filterLabel: 'Filtrer par statut',
    create: 'Nouvelle infolettre',
    dateColHint:
      "Date de publication ; tant que l'infolettre n'est pas publiée, date de création.",
    datePublishedShort: 'Publiée le',
    dateCreatedShort: 'Créée le',
    lastSentNever: 'jamais envoyée',
    lastSentTestOnly: 'test seulement',
    lastSentTitle: 'Dernier envoi réel aux membres',
    statusUnknown: 'Statut inconnu',
    statusUnknownTitle: 'Statut non reconnu :',
    loadErrorTitle: 'Impossible de charger les infolettres',
    loadErrorBody: 'Une erreur est survenue. Vérifiez votre connexion.',
    loadFailed: 'Échec du chargement des infolettres.',
    noMatchTitle: 'Aucune infolettre ne correspond',
    noMatchBody: 'Essayez un autre titre, une autre rubrique ou un autre statut.',
    clearFilters: 'Réinitialiser les filtres',
    kpiHint: 'Filtrer la liste sur ce statut',
  },
  en: {
    heading: 'Newsletters',
    lede: 'Short pieces for your members.',
    searchLabel: 'Search newsletters',
    searchPlaceholder: 'Search a title or a tag…',
    filterLabel: 'Filter by status',
    create: 'New newsletter',
    dateColHint:
      'Publication date; until the newsletter is published, its creation date.',
    datePublishedShort: 'Published',
    dateCreatedShort: 'Created',
    lastSentNever: 'never sent',
    lastSentTestOnly: 'test only',
    lastSentTitle: 'Last real send to members',
    statusUnknown: 'Unknown status',
    statusUnknownTitle: 'Unrecognized status:',
    loadErrorTitle: 'Could not load the newsletters',
    loadErrorBody: 'Something went wrong. Check your connection.',
    loadFailed: 'Failed to load the newsletters.',
    noMatchTitle: 'No newsletter matches',
    noMatchBody: 'Try another title, tag or status.',
    clearFilters: 'Clear filters',
    kpiHint: 'Filter the list on this status',
  },
} as const

/** Widens the `as const` literals to `string` while keeping the key set, so
 *  the fr/en maps stay interchangeable and `keyof` still fails the build when a
 *  key is dropped. */
type LocalCopy = { [K in keyof (typeof LOCAL)['fr']]: string }

/**
 * Keyed by the union so adding a status to `NewsletterDto['status']` fails the
 * build here until it gets a label. The runtime guard below still matters: the
 * backend types `Newsletter.Status` as a bare `string` (no enum), the store is
 * schemaless (Azure Table Storage / JSONL fallback), and several controller
 * checks compare it with `OrdinalIgnoreCase` — so a persisted row can legally
 * carry a casing or a value this union does not describe.
 */
const STATUS_LABEL_KEY: Record<NewsletterDto['status'], keyof DashboardTranslations> = {
  draft: 'newsletterStatusDraft',
  published: 'newsletterStatusPublished',
  sent: 'newsletterStatusSent',
}

const KNOWN_STATUSES = Object.keys(
  STATUS_LABEL_KEY,
) as NewsletterDto['status'][]

function isKnownStatus(status: string): status is NewsletterDto['status'] {
  return (KNOWN_STATUSES as string[]).includes(status)
}

/** Neutral fallback so an unrecognized status still reads as a pill. The
 *  `.adash-pill.is-*` variants in admin.css only cover the known statuses;
 *  bare `.adash-pill` is layout-only (no background), which would render an
 *  unstyled blob. Inline tokens keep the fallback self-contained. */
const UNKNOWN_PILL_STYLE: CSSProperties = {
  background: 'var(--ad-surface-2)',
  color: 'var(--ad-muted)',
  border: '1px solid var(--ad-border)',
}

/** Maps a raw backend status onto a pill. Normalizes case/whitespace first so
 *  a stored "Draft" still lands on `.adash-pill.is-draft`. */
function statusPill(
  raw: string,
  copy: LocalCopy,
  t: DashboardTranslations,
): {
  className: string
  label: string
  style?: CSSProperties
  title?: string
} {
  const status = (raw ?? '').trim().toLowerCase()
  if (isKnownStatus(status)) {
    return {
      className: `adash-pill is-${status}`,
      label: t[STATUS_LABEL_KEY[status]],
    }
  }
  return {
    className: 'adash-pill',
    label: raw?.trim() || copy.statusUnknown,
    style: UNKNOWN_PILL_STYLE,
    title: `${copy.statusUnknownTitle} ${raw || '(vide)'}`,
  }
}

/**
 * Admin index page for the editorial module. Lists every newsletter with a
 * KPI strip up top, a search + status filter toolbar, and a table whose title
 * cell is a real link to the standalone editor route
 * `/admin/newsletters/:id` (the whole row stays clickable as a convenience).
 * Creating a new newsletter routes to `/admin/newsletters/new`, which the
 * editor recognizes as an unsaved draft.
 *
 * Read-only: every mutation (save, publish, send, delete) lives in the editor
 * route, so the only network call here is the list GET.
 */
export default function AdminNewslettersSection() {
  const { token } = useOutletContext<AdminCtx>()
  const navigate = useNavigate()
  const { language } = useLanguage()
  const t = useTranslations(language, 'dashboard')
  const copy: LocalCopy = LOCAL[language]
  const [data, setData] = useState<AdminNewslettersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')

  // Monotonic request id: only the newest in-flight load may commit state, so
  // a slow first response cannot clobber a newer token change or retry.
  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const d = await adminListNewsletters(token)
      if (requestIdRef.current !== requestId) return
      setData(d)
    } catch (e) {
      if (requestIdRef.current !== requestId) return
      setError(e instanceof Error ? e.message : copy.loadFailed)
    } finally {
      if (requestIdRef.current === requestId) setLoading(false)
    }
  }, [token, copy.loadFailed])

  // `load` is a useCallback with its own dep list, and the effect body calls it
  // rather than being it. Passing `load` straight to useEffect would (a) hide a
  // future dependency behind a hand-written array and (b) hand React the
  // returned promise as a cleanup function.
  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const list = data?.newsletters ?? []
    const q = search.trim().toLowerCase()
    return list.filter((n) => {
      if (filter !== 'all' && n.status !== filter) return false
      if (!q) return true
      return `${n.titleFr} ${n.titleEn} ${n.tag}`.toLowerCase().includes(q)
    })
  }, [data, search, filter])

  const locale = language === 'fr' ? 'fr-CH' : 'en-GB'
  const fmt = (iso?: string | null) => {
    if (!iso) return null
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(locale)
  }
  /** Full date + time, used for the cells' `title` so a stale-looking day can
   *  be checked without opening the editor. */
  const fmtLong = (iso?: string | null) => {
    if (!iso) return undefined
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString(locale)
  }

  const totals = {
    drafts: data?.drafts ?? 0,
    published: data?.published ?? 0,
    sent: data?.sent ?? 0,
  }

  // A failed *first* load and a genuinely empty list are different situations
  // and must not share the empty state.
  const hasLoaded = data !== null
  const isFiltering = Boolean(search.trim()) || filter !== 'all'

  const editorPath = (id: string) => `/admin/newsletters/${id}`

  /** Row click is a convenience on top of the title link. Anything the browser
   *  already handles natively — the link itself, a modified click meant to open
   *  a new tab/window, a nested control — is left alone so we never navigate
   *  twice or swallow a Cmd-click. */
  const onRowClick = (e: MouseEvent<HTMLTableRowElement>, id: string) => {
    if (e.defaultPrevented) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const el = e.target as HTMLElement | null
    if (el?.closest('a, button, input, select, textarea, label')) return
    navigate(editorPath(id))
  }

  /** KPI cards double as status filters; clicking the active one clears it,
   *  which is what `aria-pressed` promises. */
  const toggleFilter = (status: NewsletterDto['status']) =>
    setFilter((prev) => (prev === status ? 'all' : status))

  const kpis: {
    status: NewsletterDto['status']
    label: string
    value: number
    sub: string
  }[] = [
    {
      status: 'draft',
      label: t.newsletterKpiDrafts,
      value: totals.drafts,
      sub: t.newsletterKpiDraftsSub,
    },
    {
      status: 'published',
      label: t.newsletterKpiPublished,
      value: totals.published,
      sub: t.newsletterKpiPublishedSub,
    },
    {
      status: 'sent',
      label: t.newsletterKpiSent,
      value: totals.sent,
      sub: t.newsletterKpiSentSub,
    },
  ]

  return (
    <>
      <div className="adash-head">
        <div>
          <p className="adash-kicker">{t.newsletterKicker}</p>
          <h2>{copy.heading}</h2>
          <p>{copy.lede}</p>
        </div>
      </div>

      <div className="adash-head-actions adash-people-toolbar">
        <div className="adash-search">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
            <path
              d="m20 20-3.2-3.2"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
          <input
            className="adash-input"
            aria-label={copy.searchLabel}
            placeholder={copy.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="adash-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as StatusFilter)}
          aria-label={copy.filterLabel}
        >
          <option value="all">{t.newsletterFilterAll}</option>
          <option value="draft">{t.newsletterFilterDraft}</option>
          <option value="published">{t.newsletterFilterPublished}</option>
          <option value="sent">{t.newsletterFilterSent}</option>
        </select>
        <button
          className="adash-btn adash-btn-primary"
          onClick={() => navigate('/admin/newsletters/new')}
        >
          {copy.create}
        </button>
      </div>

      {/* Refresh failed but a previous list is still on screen: warn without
          throwing the usable table away. */}
      {error && hasLoaded && (
        <div
          className="adash-error"
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span>{error}</span>
          <button
            className="adash-btn adash-btn-ghost adash-btn-sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? t.newsletterBusy : t.newsletterListRetry}
          </button>
        </div>
      )}

      {/* Layout lives in CSS (`adash-kpi-grid-3`) so admin.css keeps ownership
          of the breakpoints: an inline `gridTemplateColumns` here used to win
          over the media queries and left three cards side by side at 390px. */}
      <div className="adash-kpi-grid adash-kpi-grid-3">
        {kpis.map((k) => (
          <div
            key={k.status}
            className="adash-kpi adash-kpi-link adash-kpi-compact"
            role="button"
            tabIndex={0}
            aria-pressed={filter === k.status}
            title={copy.kpiHint}
            onClick={() => toggleFilter(k.status)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleFilter(k.status)
              }
            }}
          >
            <span className="adash-kpi-label">{k.label}</span>
            <strong className="adash-kpi-value">{k.value}</strong>
            <span className="adash-kpi-sub">{k.sub}</span>
          </div>
        ))}
      </div>

      <div className="adash-panel adash-panel-flush">
        {loading && !hasLoaded ? (
          /* 1. Loading. The skeleton bars are decorative (`aria-hidden` inside
                AdminSkeletonRows), so the live region needs real text of its
                own — otherwise screen readers announce an empty status. */
          <div role="status" aria-live="polite">
            <p
              className="adash-empty-hint"
              style={{ margin: 0, padding: '16px 16px 0' }}
            >
              {t.newsletterListLoading}
            </p>
            <AdminSkeletonRows rows={6} />
          </div>
        ) : !hasLoaded ? (
          /* 2. Load failed with nothing to show — distinct from "empty". */
          <div className="adash-empty-rich" role="alert">
            <p className="adash-empty-title">{copy.loadErrorTitle}</p>
            <p className="adash-empty-hint">{error ?? copy.loadErrorBody}</p>
            <button
              className="adash-btn adash-btn-primary adash-btn-sm"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? t.newsletterBusy : t.newsletterListRetry}
            </button>
          </div>
        ) : (
          <div className="adash-table-wrap">
            <table className="adash-table">
              <thead>
                <tr>
                  {/* The Date column is publishedAt-or-createdAt: say so in the
                      header tooltip, and label each cell with the date it
                      actually is. */}
                  <th scope="col" title={copy.dateColHint}>
                    {t.newsletterColDate}
                  </th>
                  <th scope="col">{t.newsletterColTitle}</th>
                  <th scope="col">{t.newsletterColTag}</th>
                  <th scope="col">{t.newsletterColStatus}</th>
                  {/* Test sends deliberately do not count as a last send. */}
                  <th scope="col" title={copy.lastSentTitle}>
                    {t.newsletterColLastSent}
                  </th>
                  <th scope="col">{t.newsletterColRecipients}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((n) => {
                  const pill = statusPill(n.status, copy, t)
                  const isPublishedDate = Boolean(n.publishedAt)
                  const dateIso = n.publishedAt ?? n.createdAt
                  // `lastSentAt` is only stamped by a real send. A test send
                  // leaves an audit row behind, so fall back to it only to say
                  // "test only" — never to imply members received anything.
                  const realSentIso =
                    n.lastSentAt ??
                    (n.lastSend && !n.lastSend.testMode ? n.lastSend.sentAt : null)
                  const testOnly = !realSentIso && Boolean(n.lastSend?.testMode)
                  const recipients = n.lastSend
                    ? t.newsletterRecipientsFigureLabel
                        .replace('{sent}', String(n.lastSend.sent))
                        .replace('{total}', String(n.lastSend.totalRecipients))
                    : null
                  return (
                    <tr
                      key={n.id}
                      className="adash-row-clickable"
                      onClick={(e) => onRowClick(e, n.id)}
                    >
                      <td title={fmtLong(dateIso)}>
                        <span className="adash-strong">{fmt(dateIso) ?? '—'}</span>
                        <br />
                        <span className="adash-person-sub">
                          {isPublishedDate
                            ? copy.datePublishedShort
                            : copy.dateCreatedShort}
                        </span>
                      </td>
                      <td>
                        {/* Real link: keyboard reachable, middle-clickable and
                            Cmd-clickable, unlike the old clickable <tr>. */}
                        <Link className="adash-link adash-strong" to={editorPath(n.id)}>
                          {n.titleFr || <em>{t.newsletterUntitled}</em>}
                        </Link>
                        <br />
                        <span className="adash-person-sub">{n.titleEn || '—'}</span>
                      </td>
                      {/* `.adash-pill.is-tag` is deliberately quieter than the
                          status pills — a hairline edge and a 4.5% fill against
                          their 18% tint — so the Status column keeps the only
                          coloured pill and the tag reads as a label, not a
                          state. Empty tags stay a plain dash rather than an
                          empty chip. */}
                      <td>
                        {n.tag?.trim() ? (
                          <span className="adash-pill is-tag">{n.tag.trim()}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <span
                          className={pill.className}
                          style={pill.style}
                          title={pill.title}
                        >
                          {pill.label}
                        </span>
                      </td>
                      <td title={realSentIso ? fmtLong(realSentIso) : undefined}>
                        {realSentIso ? (
                          <span className="adash-strong">{fmt(realSentIso)}</span>
                        ) : (
                          <span className="adash-person-sub">
                            {testOnly ? copy.lastSentTestOnly : copy.lastSentNever}
                          </span>
                        )}
                      </td>
                      <td>
                        {recipients && n.lastSend ? (
                          <>
                            <span
                              className="adash-mono"
                              title={recipients}
                              aria-hidden="true"
                            >
                              {n.lastSend.sent}/{n.lastSend.totalRecipients}
                            </span>
                            {/* The bare figure means nothing read aloud, so the
                                spelled-out sentence is what AT gets. */}
                            <span className="sr-only">{recipients}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      {/* 3. Genuinely empty (loaded, no error) — or filtered to
                          nothing, which offers "clear filters" instead of the
                          create CTA. */}
                      <AdminEmpty
                        title={
                          isFiltering ? copy.noMatchTitle : t.newsletterListEmptyTitle
                        }
                        hint={
                          isFiltering ? copy.noMatchBody : t.newsletterListEmptyBody
                        }
                        action={
                          isFiltering ? (
                            <button
                              className="adash-btn adash-btn-ghost adash-btn-sm"
                              onClick={() => {
                                setSearch('')
                                setFilter('all')
                              }}
                            >
                              {copy.clearFilters}
                            </button>
                          ) : (
                            <button
                              className="adash-btn adash-btn-primary adash-btn-sm"
                              onClick={() => navigate('/admin/newsletters/new')}
                            >
                              {t.newsletterListEmptyCta}
                            </button>
                          )
                        }
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
