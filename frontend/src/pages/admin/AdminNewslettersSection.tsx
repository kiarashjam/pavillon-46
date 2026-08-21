import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  adminListNewsletters,
  type AdminNewslettersResponse,
  type NewsletterDto,
} from '../../lib/api'
import type { AdminCtx } from '../../components/admin/AdminLayout'
import { AdminEmpty, AdminSkeletonRows } from '../../components/admin/adminUi'

type StatusFilter = 'all' | NewsletterDto['status']

/**
 * Keyed by the union so adding a status to `NewsletterDto['status']` fails the
 * build here until it gets a label. The runtime guard below still matters: the
 * backend types `Newsletter.Status` as a bare `string` (no enum), the store is
 * schemaless (Azure Table Storage / JSONL fallback), and several controller
 * checks compare it with `OrdinalIgnoreCase` — so a persisted row can legally
 * carry a casing or a value this union does not describe.
 */
const STATUS_LABEL: Record<NewsletterDto['status'], string> = {
  draft: 'Brouillon',
  published: 'Publiée',
  sent: 'Envoyée',
}

const KNOWN_STATUSES = Object.keys(STATUS_LABEL) as NewsletterDto['status'][]

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
function statusPill(raw: string): {
  className: string
  label: string
  style?: CSSProperties
  title?: string
} {
  const status = (raw ?? '').trim().toLowerCase()
  if (isKnownStatus(status)) {
    return { className: `adash-pill is-${status}`, label: STATUS_LABEL[status] }
  }
  return {
    className: 'adash-pill',
    label: raw?.trim() || 'Statut inconnu',
    style: UNKNOWN_PILL_STYLE,
    title: `Statut non reconnu : ${raw || '(vide)'}`,
  }
}

/**
 * Admin index page for the editorial module. Lists every newsletter with a
 * KPI strip up top, a search + status filter toolbar, and a table whose rows
 * open the standalone editor route `/admin/newsletters/:id`. Creating a new
 * newsletter routes to `/admin/newsletters/new`, which the editor recognizes
 * as an unsaved draft.
 *
 * Read-only: every mutation (save, publish, send, delete) lives in the editor
 * route, so the only network call here is the list GET.
 */
export default function AdminNewslettersSection() {
  const { token } = useOutletContext<AdminCtx>()
  const navigate = useNavigate()
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
      setError(
        e instanceof Error ? e.message : 'Échec du chargement des infolettres.',
      )
    } finally {
      if (requestIdRef.current === requestId) setLoading(false)
    }
  }, [token])

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

  const fmt = (iso?: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR')
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

  return (
    <>
      <div className="adash-head">
        <div>
          <p className="adash-kicker">Éditorial</p>
          <h2>Infolettres</h2>
          <p>Textes courts pour vos membres.</p>
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
            aria-label="Rechercher une infolettre"
            placeholder="Rechercher un titre ou un tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="adash-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as StatusFilter)}
          aria-label="Filtrer par statut"
        >
          <option value="all">Tous les statuts</option>
          <option value="draft">Brouillons</option>
          <option value="published">Publiées</option>
          <option value="sent">Envoyées</option>
        </select>
        <button
          className="adash-btn adash-btn-primary"
          onClick={() => navigate('/admin/newsletters/new')}
        >
          Nouvelle infolettre
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
            {loading ? 'Chargement…' : 'Réessayer'}
          </button>
        </div>
      )}

      <div className="adash-kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div
          className="adash-kpi adash-kpi-link adash-kpi-compact"
          role="button"
          tabIndex={0}
          onClick={() => setFilter('draft')}
          onKeyDown={(e) => { if (e.key === 'Enter') setFilter('draft') }}
        >
          <span className="adash-kpi-label">Brouillons</span>
          <strong className="adash-kpi-value">{totals.drafts}</strong>
          <span className="adash-kpi-sub">en cours d'écriture</span>
        </div>
        <div
          className="adash-kpi adash-kpi-link adash-kpi-compact"
          role="button"
          tabIndex={0}
          onClick={() => setFilter('published')}
          onKeyDown={(e) => { if (e.key === 'Enter') setFilter('published') }}
        >
          <span className="adash-kpi-label">Publiées</span>
          <strong className="adash-kpi-value">{totals.published}</strong>
          <span className="adash-kpi-sub">prêtes à envoyer</span>
        </div>
        <div
          className="adash-kpi adash-kpi-link adash-kpi-compact"
          role="button"
          tabIndex={0}
          onClick={() => setFilter('sent')}
          onKeyDown={(e) => { if (e.key === 'Enter') setFilter('sent') }}
        >
          <span className="adash-kpi-label">Envoyées</span>
          <strong className="adash-kpi-value">{totals.sent}</strong>
          <span className="adash-kpi-sub">distribuées aux membres</span>
        </div>
      </div>

      <div className="adash-panel adash-panel-flush">
        {loading && !hasLoaded ? (
          /* 1. Loading */
          <div role="status" aria-live="polite" aria-label="Chargement des infolettres…">
            <AdminSkeletonRows rows={6} />
          </div>
        ) : !hasLoaded ? (
          /* 2. Load failed with nothing to show — distinct from "empty". */
          <div className="adash-empty-rich" role="alert">
            <p className="adash-empty-title">Impossible de charger les infolettres</p>
            <p className="adash-empty-hint">
              {error ?? 'Une erreur est survenue. Vérifiez votre connexion.'}
            </p>
            <button
              className="adash-btn adash-btn-primary adash-btn-sm"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? 'Chargement…' : 'Réessayer'}
            </button>
          </div>
        ) : (
          <div className="adash-table-wrap">
            <table className="adash-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Titre</th>
                  <th>Tag</th>
                  <th>Statut</th>
                  <th>Destinataires</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((n) => {
                  const pill = statusPill(n.status)
                  return (
                    <tr
                      key={n.id}
                      className="adash-row-clickable"
                      role="button"
                      tabIndex={0}
                      aria-label={`Ouvrir ${n.titleFr || 'infolettre sans titre'}`}
                      onClick={() => navigate(`/admin/newsletters/${n.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          navigate(`/admin/newsletters/${n.id}`)
                        }
                      }}
                    >
                      <td>{fmt(n.publishedAt ?? n.createdAt)}</td>
                      <td>
                        <span className="adash-strong">
                          {n.titleFr || <em>(sans titre)</em>}
                        </span>
                        <br />
                        <span className="adash-person-sub">{n.titleEn || '—'}</span>
                      </td>
                      <td>
                        {n.tag ? <span className="adash-pill">{n.tag}</span> : '—'}
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
                      <td className="adash-mono">
                        {n.lastSend
                          ? `${n.lastSend.sent}/${n.lastSend.totalRecipients}`
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      {/* 3. Genuinely empty (loaded, no error) — or filtered to
                          nothing, which offers "clear filters" instead of the
                          create CTA. */}
                      <AdminEmpty
                        title={
                          isFiltering
                            ? 'Aucune infolettre ne correspond'
                            : 'Aucune infolettre'
                        }
                        hint={
                          isFiltering
                            ? 'Essayez un autre titre, tag ou statut.'
                            : 'Rédigez votre premier texte pour les membres.'
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
                              Réinitialiser les filtres
                            </button>
                          ) : (
                            <button
                              className="adash-btn adash-btn-primary adash-btn-sm"
                              onClick={() => navigate('/admin/newsletters/new')}
                            >
                              Nouvelle infolettre
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
