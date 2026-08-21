import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import {
  ApiError,
  adminCreateNewsletter,
  adminDeleteNewsletter,
  adminDraftNewsletterWithAi,
  adminGetNewsletter,
  adminListMembers,
  adminPublishNewsletter,
  adminUnpublishNewsletter,
  adminUpdateNewsletter,
  type AiDraftResponse,
  type NewsletterDto,
  type NewsletterSendAuditDto,
} from '../../lib/api'
import { useLanguage } from '../../contexts/LanguageContext'
import { useTranslations } from '../../lib/translations'
import type { AdminCtx } from '../../components/admin/AdminLayout'
import AdminModal from '../../components/admin/AdminModal'
import NewsletterSendConfirmModal from '../../components/admin/NewsletterSendConfirmModal'

const DEFAULT_COVER = '/images/newsletter-cover-default.jpg'
const MUTED = 'var(--ad-muted, #93a69c)'

const STATUS_LABEL: Record<NewsletterDto['status'], string> = {
  draft: 'Brouillon',
  published: 'Publiée',
  sent: 'Envoyée',
}

type DraftForm = {
  titleFr: string
  titleEn: string
  tag: string
  coverImageUrl: string
  coverImageKeyword: string
  bodyFr: string
  bodyEn: string
  sourceBrief: string
  aiDrafted: boolean
}

const empty: DraftForm = {
  titleFr: '',
  titleEn: '',
  tag: '',
  coverImageUrl: '',
  coverImageKeyword: '',
  bodyFr: '',
  bodyEn: '',
  sourceBrief: '',
  aiDrafted: false,
}

const fromDto = (n: NewsletterDto): DraftForm => ({
  titleFr: n.titleFr ?? '',
  titleEn: n.titleEn ?? '',
  tag: n.tag ?? '',
  coverImageUrl: n.coverImageUrl ?? '',
  coverImageKeyword: n.coverImageKeyword ?? '',
  bodyFr: n.bodyFr ?? '',
  bodyEn: n.bodyEn ?? '',
  sourceBrief: n.sourceBrief ?? '',
  aiDrafted: !!n.aiDrafted,
})

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)

/** Keys for the newsletter-AI failure copy that lives in the shared FR/EN
 *  dictionary (`lib/translations.ts`). */
type SharedAiKey = 'newsletterAiRateLimited' | 'newsletterAiUnusable' | 'newsletterAiFailed'

/**
 * Copy introduced by this editor's confirm/error surfaces. The rest of the
 * admin console is still hard-coded French; only the strings added here are
 * bilingual, because the destructive-delete confirm and the AI failure notices
 * have to speak the language the operator picked in-app.
 */
const COPY = {
  fr: {
    audienceLoading: 'Calcul du nombre de destinataires…',
    audienceUnknown:
      'Nombre de destinataires indisponible — impossible de confirmer un envoi pour le moment.',
    audienceReady: (n: number) =>
      `${n} membre${n === 1 ? '' : 's'} actif${n === 1 ? '' : 's'} et abonné${n === 1 ? '' : 's'} recevront cette infolettre.`,
    aiRateLimited:
      'Trop de brouillons demandés coup sur coup. Patientez quelques minutes avant de réessayer.',
    aiUnusable:
      "L'IA n'a pas produit de brouillon exploitable. Reformulez le brief et réessayez.",
    aiFailed: 'Génération impossible.',
    aiOverwriteWarning:
      'Le brouillon en cours contient déjà du texte. Générer va remplacer les titres et le corps saisis.',
    aiGenerate: 'Générer',
    aiGenerateConfirm: 'Remplacer et générer',
    aiGenerating: 'Génération…',
    deleteTitle: 'Supprimer cette infolettre ?',
    deleteBody:
      'Cette action est irréversible. Le texte, la couverture et l’historique d’envoi seront perdus.',
    cancel: 'Annuler',
    deleteConfirm: 'Supprimer définitivement',
    deleteBusy: 'Suppression…',
    delete: 'Supprimer',
    deleteFailed: 'Suppression impossible.',
    close: 'Fermer',
    untitled: '(sans titre)',
  },
  en: {
    audienceLoading: 'Counting recipients…',
    audienceUnknown:
      'Recipient count unavailable — a send cannot be confirmed right now.',
    audienceReady: (n: number) =>
      `${n} active, subscribed member${n === 1 ? '' : 's'} will receive this newsletter.`,
    aiRateLimited: 'Too many drafts requested at once. Wait a few minutes and try again.',
    aiUnusable: 'The AI could not produce a usable draft. Try rephrasing the brief.',
    aiFailed: 'Could not generate a draft.',
    aiOverwriteWarning:
      'This draft already has text. Generating will replace the titles and body you typed.',
    aiGenerate: 'Generate',
    aiGenerateConfirm: 'Replace and generate',
    aiGenerating: 'Generating…',
    deleteTitle: 'Delete this newsletter?',
    deleteBody:
      'This cannot be undone. The copy, cover image and send history will be lost.',
    cancel: 'Cancel',
    deleteConfirm: 'Delete permanently',
    deleteBusy: 'Deleting…',
    delete: 'Delete',
    deleteFailed: 'Could not delete this newsletter.',
    close: 'Close',
    untitled: '(untitled)',
  },
} as const

/**
 * Standalone editor route (`/admin/newsletters/:id`). When id === 'new' the
 * form starts empty; the first Save creates the newsletter and swaps the URL
 * to its real id (via `navigate(..., { replace: true })`) so browser reload
 * keeps working. Every action network call has its own loading/error state.
 */
export default function AdminNewsletterEditor() {
  const { id } = useParams<{ id: string }>()
  const { token } = useOutletContext<AdminCtx>()
  const navigate = useNavigate()
  const { language } = useLanguage()
  const copy = COPY[language]
  // The AI failure copy is owned by the shared dictionary. Read it through the
  // normal hook but tolerate its absence, so this file keeps working (falling
  // back to the local strings above) whichever way translations.ts lands.
  const shared = useTranslations(language, 'dashboard') as unknown as Partial<
    Record<SharedAiKey, string>
  >
  const isNew = !id || id === 'new'

  const [newsletter, setNewsletter] = useState<NewsletterDto | null>(null)
  const [form, setForm] = useState<DraftForm>(empty)
  const [loading, setLoading] = useState(!isNew)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [publishBusy, setPublishBusy] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Fallback audience count, used only while the newsletter has never been
  // saved (no DTO yet, hence no server-computed audienceCount).
  const [fallbackAudience, setFallbackAudience] = useState<number | null>(null)
  const [fallbackAudienceBusy, setFallbackAudienceBusy] = useState(false)
  const [audienceError, setAudienceError] = useState<string | null>(null)

  const [aiOpen, setAiOpen] = useState(false)
  const [aiBrief, setAiBrief] = useState('')
  const [aiTone, setAiTone] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  // Second-click gate: set when Generate would clobber text already in the form.
  const [aiConfirmOverwrite, setAiConfirmOverwrite] = useState(false)

  const [sendOpen, setSendOpen] = useState(false)
  const [sendResult, setSendResult] = useState<NewsletterSendAuditDto | null>(null)
  const [preview, setPreview] = useState<'fr' | 'en'>('fr')

  // ---- Load existing newsletter -----------------------------------------

  useEffect(() => {
    if (isNew) {
      setNewsletter(null)
      setForm(empty)
      setLoading(false)
      setLoadError(null)
      return
    }
    let alive = true
    setLoading(true)
    setLoadError(null)
    adminGetNewsletter(token, id!)
      .then((n) => {
        if (!alive) return
        setNewsletter(n)
        setForm(fromDto(n))
      })
      .catch((e) => {
        if (!alive) return
        setLoadError(e instanceof Error ? e.message : 'Impossible de charger cette infolettre.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [id, isNew, token])

  // ---- Audience count (recipients preview) ------------------------------
  //
  // The server already knows the answer: NewsletterDto.audienceCount is the
  // count of active, non-opt-out members with an email — the exact same filter
  // NewsletterSender applies when it builds the recipient list. Recounting
  // /api/admin/members client-side used to over-count, because it ignored
  // newsletterOptOut. So the DTO value wins whenever we have one; the member
  // fetch below survives only for a brand-new, never-saved newsletter, and it
  // now applies both halves of the backend filter.

  const dtoAudience =
    newsletter && Number.isFinite(newsletter.audienceCount) ? newsletter.audienceCount : null

  useEffect(() => {
    // A saved newsletter carries its own count; don't fetch the member list.
    if (!isNew) return
    let alive = true
    setAudienceError(null)
    setFallbackAudienceBusy(true)
    adminListMembers(token)
      .then((r) => {
        if (!alive) return
        setFallbackAudience(
          r.members.filter((m) => m.status === 'active' && !m.newsletterOptOut).length,
        )
      })
      .catch((e) => {
        if (!alive) return
        // Detail only — the Actions panel states the "unknown" outcome itself,
        // so a non-Error rejection still surfaces as an explicit unknown.
        setAudienceError(e instanceof Error ? e.message : null)
        setFallbackAudience(null)
      })
      .finally(() => {
        if (alive) setFallbackAudienceBusy(false)
      })
    return () => { alive = false }
  }, [isNew, token])

  const audienceCount = dtoAudience ?? fallbackAudience
  // Still in flight — distinct from "we tried and failed", so the UI never
  // parks on a permanent "loading recipients" line.
  const audienceLoading = audienceCount == null && (loading || fallbackAudienceBusy)
  const audienceUnknown = audienceCount == null && !audienceLoading

  // ---- Handlers ---------------------------------------------------------

  const setField = <K extends keyof DraftForm>(k: K, v: DraftForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const canSave = form.titleFr.trim().length > 0 && form.bodyFr.trim().length > 0

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    setDeleteError(null)
    setSavedFlash(false)
    try {
      const payload = {
        titleFr: form.titleFr,
        titleEn: form.titleEn,
        bodyFr: form.bodyFr,
        bodyEn: form.bodyEn,
        tag: form.tag,
        coverImageUrl: form.coverImageUrl,
        coverImageKeyword: form.coverImageKeyword,
        sourceBrief: form.sourceBrief,
        aiDrafted: form.aiDrafted,
      }
      const saved = newsletter
        ? await adminUpdateNewsletter(token, newsletter.id, payload)
        : await adminCreateNewsletter(token, payload)
      setNewsletter(saved)
      setForm(fromDto(saved))
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 2000)
      if (!newsletter) {
        // First save promoted /new → real id. Keep the browser location honest
        // without pushing a new history entry.
        navigate(`/admin/newsletters/${saved.id}`, { replace: true })
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePublish = async () => {
    if (!newsletter) return
    setPublishBusy(true)
    setPublishError(null)
    try {
      const next =
        newsletter.status === 'draft'
          ? await adminPublishNewsletter(token, newsletter.id)
          : await adminUnpublishNewsletter(token, newsletter.id)
      setNewsletter(next)
      setForm(fromDto(next))
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Action impossible.')
    } finally {
      setPublishBusy(false)
    }
  }

  /** Opens the confirm dialog (nothing is deleted here). An unsaved newsletter
   *  has nothing on the server, so "delete" is just leaving the editor. */
  const requestDelete = () => {
    if (!newsletter) {
      navigate('/admin/newsletters')
      return
    }
    // A stale "Enregistrement impossible." banner must not be mistaken for the
    // outcome of this delete.
    setSaveError(null)
    setDeleteError(null)
    setDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!newsletter) return
    setDeleteBusy(true)
    setSaveError(null)
    setDeleteError(null)
    try {
      await adminDeleteNewsletter(token, newsletter.id)
      navigate('/admin/newsletters')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : copy.deleteFailed)
      setDeleteOpen(false)
    } finally {
      setDeleteBusy(false)
    }
  }

  const applyAiDraft = (draft: AiDraftResponse) => {
    setForm((f) => ({
      ...f,
      titleFr: draft.titleFr,
      titleEn: draft.titleEn,
      bodyFr: draft.bodyFr,
      bodyEn: draft.bodyEn,
      tag: draft.tag,
      coverImageKeyword: draft.coverImageKeyword,
      coverImageUrl: draft.coverImageUrl,
      sourceBrief: aiBrief,
      aiDrafted: true,
    }))
  }

  // True when generating would throw away copy the admin has already written.
  const hasUnsavedCopy = [form.titleFr, form.titleEn, form.bodyFr, form.bodyEn].some(
    (v) => v.trim().length > 0,
  )

  /** Maps a failed AI draft onto copy the admin can act on. 429 means the
   *  per-admin rate limit tripped; 502 means the upstream model answered but
   *  the draft was unusable (ai_parse_failed / ai_incomplete / ai_timeout). */
  const aiErrorMessage = (err: unknown): string => {
    const status = err instanceof ApiError ? err.status : null
    if (status === 429) return shared.newsletterAiRateLimited ?? copy.aiRateLimited
    if (status === 502) return shared.newsletterAiUnusable ?? copy.aiUnusable
    return shared.newsletterAiFailed ?? copy.aiFailed
  }

  const handleAiGenerate = async () => {
    if (!aiBrief.trim()) {
      setAiError('Décrivez brièvement le sujet en une phrase.')
      return
    }
    // First click on a non-empty draft only arms the confirm; the second click
    // (label now reads "Remplacer et générer") actually overwrites.
    if (hasUnsavedCopy && !aiConfirmOverwrite) {
      setAiError(null)
      setAiConfirmOverwrite(true)
      return
    }
    setAiBusy(true)
    setAiError(null)
    try {
      const draft = await adminDraftNewsletterWithAi(token, {
        brief: aiBrief.trim(),
        tone: aiTone.trim() || undefined,
      })
      applyAiDraft(draft)
      setAiConfirmOverwrite(false)
      setAiOpen(false)
    } catch (err) {
      setAiError(aiErrorMessage(err))
    } finally {
      setAiBusy(false)
    }
  }

  const closeAiModal = () => {
    setAiOpen(false)
    setAiConfirmOverwrite(false)
  }

  const previewBody = preview === 'fr' ? form.bodyFr : form.bodyEn
  const previewTitle = preview === 'fr' ? form.titleFr : form.titleEn
  const wordCountFr = useMemo(() => wordCount(form.bodyFr), [form.bodyFr])
  const wordCountEn = useMemo(() => wordCount(form.bodyEn), [form.bodyEn])

  // ---- Render -----------------------------------------------------------

  if (loading) {
    return (
      <>
        <div className="adash-head">
          <div>
            <p className="adash-kicker">Éditorial</p>
            <h2>Chargement…</h2>
          </div>
        </div>
        <p className="adash-loading" role="status" aria-live="polite">
          Chargement de l'infolettre…
        </p>
      </>
    )
  }

  if (loadError) {
    return (
      <>
        <div className="adash-head">
          <div>
            <p className="adash-kicker">Éditorial</p>
            <h2>Infolettre introuvable</h2>
          </div>
        </div>
        <p className="adash-error">{loadError}</p>
        <button
          className="adash-btn adash-btn-ghost"
          onClick={() => navigate('/admin/newsletters')}
        >
          ← Retour à la liste
        </button>
      </>
    )
  }

  const status: NewsletterDto['status'] = newsletter?.status ?? 'draft'
  const isSent = status === 'sent'

  return (
    <>
      <div className="adash-head">
        <div>
          <p className="adash-kicker">Éditorial</p>
          <h2>
            {newsletter ? newsletter.titleFr || '(sans titre)' : 'Nouvelle infolettre'}
          </h2>
          <p>
            <span className={`adash-pill is-${status}`}>{STATUS_LABEL[status]}</span>
            {newsletter?.publishedAt && (
              <> · Publiée le {new Date(newsletter.publishedAt).toLocaleDateString('fr-FR')}</>
            )}
            {newsletter?.lastSentAt && (
              <> · Envoyée le {new Date(newsletter.lastSentAt).toLocaleDateString('fr-FR')}</>
            )}
          </p>
        </div>
        <div className="adash-head-actions">
          <button
            className="adash-btn adash-btn-ghost"
            onClick={() => navigate('/admin/newsletters')}
          >
            ← Retour
          </button>
        </div>
      </div>

      {sendResult && (
        <div className="adash-creds" role="status" aria-live="polite">
          <h3>
            {sendResult.testMode
              ? 'Envoi de test terminé.'
              : `Infolettre envoyée à ${sendResult.sent} membre${sendResult.sent === 1 ? '' : 's'}.`}
          </h3>
          <div className="adash-cred-row">
            <div>
              <span>En file d'attente</span>
              <strong className="adash-mono">{sendResult.totalRecipients}</strong>
            </div>
            <div>
              <span>Livrés</span>
              <strong className="adash-mono">{sendResult.sent}</strong>
            </div>
            <div>
              <span>Échecs</span>
              <strong className="adash-mono">{sendResult.failed}</strong>
            </div>
          </div>
          <div className="adash-cred-actions">
            <button
              className="adash-link"
              onClick={() => setSendResult(null)}
              style={{ marginLeft: 'auto' }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {saveError && <p className="adash-error">{saveError}</p>}
      {deleteError && <p className="adash-error">{deleteError}</p>}
      {publishError && <p className="adash-error">{publishError}</p>}
      {audienceError && <p className="adash-hint warn">{audienceError}</p>}

      <div className="adash-panel">
        <div className="adash-panel-head">
          <h3>Rédaction assistée</h3>
          <button
            className="adash-btn adash-btn-primary adash-btn-sm"
            onClick={() => { setAiError(null); setAiConfirmOverwrite(false); setAiOpen(true) }}
            disabled={isSent}
          >
            ✨ Rédiger avec l'IA
          </button>
        </div>
        <p style={{ margin: 0, color: MUTED }}>
          Décrivez un thème en une phrase, l'IA propose un texte bilingue prêt à retoucher.
          {form.aiDrafted && form.sourceBrief && (
            <>
              {' '}Dernier brief : <em>“{form.sourceBrief}”</em>.
            </>
          )}
        </p>
      </div>

      <div className="adash-panel">
        <div className="adash-panel-head">
          <h3>Métadonnées</h3>
        </div>
        <div className="adash-form-grid">
          <div className="adash-field">
            <label>Tag</label>
            <input
              className="adash-input"
              value={form.tag}
              onChange={(e) => setField('tag', e.target.value)}
              placeholder="hiver, silence avant l'aube…"
              disabled={isSent}
            />
          </div>
          <div className="adash-field">
            <label>Mot-clé image (Unsplash)</label>
            <input
              className="adash-input"
              value={form.coverImageKeyword}
              onChange={(e) => setField('coverImageKeyword', e.target.value)}
              placeholder="lake geneva, misty morning"
              disabled={isSent}
            />
          </div>
          <div className="adash-field full">
            <label>URL de couverture</label>
            <input
              className="adash-input"
              value={form.coverImageUrl}
              onChange={(e) => setField('coverImageUrl', e.target.value)}
              placeholder="https://source.unsplash.com/1200x600/?…"
              disabled={isSent}
            />
            <span className="adash-hint">
              L'aperçu ci-dessous utilise cette URL. Une image de secours s'affiche en cas
              d'erreur.
            </span>
          </div>
          <div className="adash-field full">
            <div
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.04)',
                aspectRatio: '2 / 1',
                maxWidth: 520,
              }}
            >
              <img
                src={form.coverImageUrl || DEFAULT_COVER}
                alt="Aperçu de la couverture"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={(e) => {
                  const target = e.currentTarget
                  if (target.src.endsWith(DEFAULT_COVER)) return
                  target.src = DEFAULT_COVER
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="adash-panel">
        <div className="adash-panel-head">
          <h3>Titres</h3>
        </div>
        <div className="adash-form-grid">
          <div className="adash-field">
            <label>Titre (FR) *</label>
            <input
              className="adash-input"
              value={form.titleFr}
              onChange={(e) => setField('titleFr', e.target.value)}
              disabled={isSent}
              required
            />
          </div>
          <div className="adash-field">
            <label>Titre (EN)</label>
            <input
              className="adash-input"
              value={form.titleEn}
              onChange={(e) => setField('titleEn', e.target.value)}
              disabled={isSent}
            />
          </div>
        </div>
      </div>

      <div className="adash-panel">
        <div className="adash-panel-head">
          <h3>Corps du texte (Markdown)</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`adash-btn adash-btn-sm ${preview === 'fr' ? 'adash-btn-primary' : 'adash-btn-ghost'}`}
              onClick={() => setPreview('fr')}
            >
              Aperçu FR
            </button>
            <button
              type="button"
              className={`adash-btn adash-btn-sm ${preview === 'en' ? 'adash-btn-primary' : 'adash-btn-ghost'}`}
              onClick={() => setPreview('en')}
            >
              Aperçu EN
            </button>
          </div>
        </div>
        <div className="adash-form-grid">
          <div className="adash-field">
            <label>Corps (FR) *</label>
            <textarea
              className="adash-input adash-textarea"
              rows={12}
              value={form.bodyFr}
              onChange={(e) => setField('bodyFr', e.target.value)}
              disabled={isSent}
              required
            />
            <span className="adash-hint">{wordCountFr} mots</span>
          </div>
          <div className="adash-field">
            <label>Corps (EN)</label>
            <textarea
              className="adash-input adash-textarea"
              rows={12}
              value={form.bodyEn}
              onChange={(e) => setField('bodyEn', e.target.value)}
              disabled={isSent}
            />
            <span className="adash-hint">{wordCountEn} mots</span>
          </div>
          <div className="adash-field full">
            <label>Aperçu ({preview.toUpperCase()})</label>
            <div
              className="adash-panel adash-panel-flush"
              style={{ padding: 20, background: 'rgba(255,255,255,0.03)' }}
            >
              {previewTitle && <h2 style={{ marginTop: 0 }}>{previewTitle}</h2>}
              {previewBody ? (
                <div style={{ lineHeight: 1.7 }}>
                  <ReactMarkdown>{previewBody}</ReactMarkdown>
                </div>
              ) : (
                <p style={{ margin: 0, color: MUTED }}>
                  <em>Rien à prévisualiser pour l'instant.</em>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="adash-panel">
        <div className="adash-panel-head">
          <h3>Actions</h3>
          <p
            className={`adash-hint${audienceUnknown ? ' warn' : ''}`}
            style={{ margin: 0 }}
            role="status"
            aria-live="polite"
          >
            {audienceLoading
              ? copy.audienceLoading
              : audienceCount == null
                ? copy.audienceUnknown
                : copy.audienceReady(audienceCount)}
          </p>
        </div>
        <div className="adash-detail-foot">
          <button
            type="button"
            className="adash-btn adash-btn-danger adash-btn-sm"
            onClick={requestDelete}
            disabled={deleteBusy || saving || isSent}
          >
            {deleteBusy ? copy.deleteBusy : copy.delete}
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="adash-btn adash-btn-ghost"
              onClick={() => navigate('/admin/newsletters')}
            >
              Annuler
            </button>
            <button
              type="button"
              className="adash-btn adash-btn-primary"
              onClick={handleSave}
              disabled={saving || !canSave || isSent}
            >
              {saving ? 'Enregistrement…' : savedFlash ? 'Enregistré ✓' : 'Enregistrer'}
            </button>
            {newsletter && !isSent && (
              <button
                type="button"
                className="adash-btn adash-btn-ghost"
                onClick={handleTogglePublish}
                disabled={publishBusy}
                aria-pressed={status === 'published'}
              >
                {publishBusy
                  ? '…'
                  : status === 'draft'
                    ? 'Publier'
                    : 'Retirer la publication'}
              </button>
            )}
            {newsletter && status === 'published' && (
              <button
                type="button"
                className="adash-btn adash-btn-primary"
                onClick={() => { setSendResult(null); setSendOpen(true) }}
                // Never open the confirm dialog mid-mutation, and never with an
                // unresolved audience — the dialog would sit on "Chargement du
                // nombre de destinataires…" forever.
                disabled={publishBusy || saving || deleteBusy || audienceCount == null}
                title={audienceUnknown ? copy.audienceUnknown : undefined}
              >
                Envoyer aux membres
              </button>
            )}
          </div>
        </div>
      </div>

      {aiOpen && (
        <AdminModal titleId="adm-ai-draft" onClose={closeAiModal}>
          <div className="adash-modal-head">
            <div>
              <h2 id="adm-ai-draft">✨ Rédiger avec l'IA</h2>
              <p>Un bref concept en une phrase, l'IA écrit le reste.</p>
            </div>
            <button
              type="button"
              className="adash-modal-close"
              onClick={closeAiModal}
              aria-label={copy.close}
            >
              ×
            </button>
          </div>
          <div className="adash-form-grid">
            <div className="adash-field full">
              <label>Brief *</label>
              <textarea
                className="adash-input adash-textarea"
                rows={3}
                value={aiBrief}
                onChange={(e) => setAiBrief(e.target.value)}
                placeholder="Ex. la brume sur le lac au petit matin, avant l'arrivée des membres."
                maxLength={500}
                required
              />
              <span className="adash-hint">{aiBrief.length}/500 caractères</span>
            </div>
            <div className="adash-field full">
              <label>Tonalité (optionnel)</label>
              <input
                className="adash-input"
                value={aiTone}
                onChange={(e) => setAiTone(e.target.value)}
                placeholder="Sobre, sensoriel, poétique"
              />
            </div>
          </div>
          {aiConfirmOverwrite && (
            <p className="adash-hint warn" role="alert">
              {copy.aiOverwriteWarning}
            </p>
          )}
          {aiError && <p className="adash-error">{aiError}</p>}
          <div className="adash-detail-foot">
            <button
              type="button"
              className="adash-btn adash-btn-ghost"
              onClick={closeAiModal}
              disabled={aiBusy}
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              className="adash-btn adash-btn-primary"
              onClick={handleAiGenerate}
              disabled={aiBusy || !aiBrief.trim()}
              style={{ marginLeft: 'auto' }}
            >
              {aiBusy
                ? copy.aiGenerating
                : aiConfirmOverwrite
                  ? copy.aiGenerateConfirm
                  : copy.aiGenerate}
            </button>
          </div>
        </AdminModal>
      )}

      {deleteOpen && newsletter && (
        <AdminModal titleId="adm-delete-newsletter" onClose={() => setDeleteOpen(false)}>
          <div className="adash-modal-head">
            <div>
              <h2 id="adm-delete-newsletter">{copy.deleteTitle}</h2>
              <p>{newsletter.titleFr || copy.untitled}</p>
            </div>
            <button
              type="button"
              className="adash-modal-close"
              onClick={() => setDeleteOpen(false)}
              aria-label={copy.close}
              disabled={deleteBusy}
            >
              ×
            </button>
          </div>
          <p className="adash-hint warn" style={{ margin: 0 }}>
            {copy.deleteBody}
          </p>
          <div className="adash-detail-foot">
            <button
              type="button"
              className="adash-btn adash-btn-ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteBusy}
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              className="adash-btn adash-btn-danger"
              onClick={handleDelete}
              disabled={deleteBusy}
              style={{ marginLeft: 'auto' }}
            >
              {deleteBusy ? copy.deleteBusy : copy.deleteConfirm}
            </button>
          </div>
        </AdminModal>
      )}

      {sendOpen && newsletter && (
        <NewsletterSendConfirmModal
          token={token}
          newsletter={newsletter}
          audienceCount={audienceCount}
          onClose={() => setSendOpen(false)}
          onSent={(audit) => {
            setSendResult(audit)
            // Refresh the newsletter — status may have flipped to "sent".
            adminGetNewsletter(token, newsletter.id)
              .then((n) => { setNewsletter(n); setForm(fromDto(n)) })
              .catch(() => { /* the audit banner already tells the story */ })
          }}
        />
      )}
    </>
  )
}
