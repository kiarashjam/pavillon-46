import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
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
} from '../../lib/api'
import { useLanguage } from '../../contexts/LanguageContext'
import { useTranslations } from '../../lib/translations'
import type { AdminCtx } from '../../components/admin/AdminLayout'
import AdminModal from '../../components/admin/AdminModal'
import NewsletterSendConfirmModal from '../../components/admin/NewsletterSendConfirmModal'

const MUTED = 'var(--ad-muted, #93a69c)'

/** `.adash-page` (AdminLayout) is a `flex-direction: column; gap: 22px` stack
 *  and the panels used to be its direct children. Wrapping them in a <form>
 *  makes the form a single flex item, so it has to reproduce that stack itself
 *  or every panel gap collapses. */
const FORM_STACK: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 22,
}

/* The action bar (`.adash-detail-foot.adash-sticky-foot`) and the send group
 * (`.adash-send-zone`) are styled in admin.css. Both were inline objects here
 * until integration; the CSS carries the identical values, so this is a visual
 * no-op. Two notes that the CSS comments repeat, because they are easy to undo
 * from this side: the sticky bar must stay a DIRECT CHILD of the <form> (sticky
 * only travels inside its own containing block, so a bar nested in the last
 * panel appears only once that panel scrolls into view), and the send group must
 * stay a separate bordered block rather than joining the action bar — the frame
 * is what marks the send consequential, since `.adash-btn-danger` is shared with
 * routine Delete buttons.
 */

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

/** Field-by-field equality — the dirty flag compares the live form against the
 *  last-saved snapshot, so it must not depend on key order or JSON quirks. */
const sameForm = (a: DraftForm, b: DraftForm) =>
  (Object.keys(empty) as (keyof DraftForm)[]).every((k) => a[k] === b[k])

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)

/** The four fields the backend requires before a newsletter can be published:
 *  both languages, title and body. Order matters — validation focuses the first
 *  offender, so it walks the form top to bottom. */
const REQUIRED_FIELDS = [
  { key: 'titleFr', id: 'nl-title-fr' },
  { key: 'bodyFr', id: 'nl-body-fr' },
  { key: 'titleEn', id: 'nl-title-en' },
  { key: 'bodyEn', id: 'nl-body-en' },
] as const

/**
 * Copy this editor still owns locally, because `translations.ts` has no key for
 * it yet (kicker, load/not-found states, status pills, the AI modal, the delete
 * body). Everything that *does* have a key is read from the shared dictionary
 * via `useTranslations(language, 'dashboard')`.
 */
const COPY = {
  fr: {
    loadingBody: "Chargement de l'infolettre…",
    notFoundTitle: 'Infolettre introuvable',
    loadFailed: 'Impossible de charger cette infolettre.',
    saveFailed: 'Enregistrement impossible.',
    publishFailed: 'Action impossible.',
    sentOn: 'Envoyée le {date}',
    audienceLoading: 'Calcul du nombre de destinataires…',
    markdownHint: 'Markdown accepté.',
    wordCount: '{n} mots',
    previewEmpty: "Rien à prévisualiser pour l'instant.",
    coverAlt: 'Aperçu de la couverture',
    coverHint:
      "L'aperçu ci-dessous utilise cette URL. Sans couverture, l'infolettre s'ouvre directement sur le titre.",
    tagPlaceholder: "hiver, silence avant l'aube…",
    keywordPlaceholder: 'lake geneva, misty morning',
    coverUrlPlaceholder: 'https://images.unsplash.com/photo-…',
    aiCta: "Rédiger avec l'IA",
    aiPanelBody:
      "Décrivez un thème en une phrase, l'IA propose un texte bilingue prêt à retoucher.",
    aiLastBrief: 'Dernier brief',
    aiModalSubtitle: "Un bref concept en une phrase, l'IA écrit le reste.",
    aiBriefLabel: 'Brief',
    aiBriefPlaceholder:
      "Ex. la brume sur le lac au petit matin, avant l'arrivée des membres.",
    aiBriefRequired: 'Décrivez brièvement le sujet en une phrase.',
    aiBriefCount: '{n}/500 caractères',
    aiToneLabel: 'Tonalité (optionnel)',
    aiTonePlaceholder: 'Sobre, sensoriel, poétique',
    aiGenerate: 'Générer',
    aiGenerateConfirm: 'Remplacer et générer',
    aiGenerating: 'Génération…',
    deleteBody:
      "Cette action est irréversible. Le texte, la couverture et l'historique d'envoi seront perdus.",
    deleteConfirm: 'Supprimer définitivement',
  },
  en: {
    loadingBody: 'Loading this newsletter…',
    notFoundTitle: 'Newsletter not found',
    loadFailed: 'Could not load this newsletter.',
    saveFailed: 'Could not save.',
    publishFailed: 'That action failed.',
    sentOn: 'Sent on {date}',
    audienceLoading: 'Counting recipients…',
    markdownHint: 'Markdown supported.',
    wordCount: '{n} words',
    previewEmpty: 'Nothing to preview yet.',
    coverAlt: 'Cover image preview',
    coverHint:
      'The preview below uses this URL. With no cover, the newsletter opens straight on its title.',
    tagPlaceholder: 'winter, the hush before dawn…',
    keywordPlaceholder: 'lake geneva, misty morning',
    coverUrlPlaceholder: 'https://images.unsplash.com/photo-…',
    aiCta: 'Draft with AI',
    aiPanelBody:
      'Describe a theme in one sentence and the AI proposes bilingual copy ready to edit.',
    aiLastBrief: 'Last brief',
    aiModalSubtitle: 'A one-sentence concept, and the AI writes the rest.',
    aiBriefLabel: 'Brief',
    aiBriefPlaceholder:
      'e.g. mist over the lake at first light, before the members arrive.',
    aiBriefRequired: 'Describe the subject briefly, in one sentence.',
    aiBriefCount: '{n}/500 characters',
    aiToneLabel: 'Tone (optional)',
    aiTonePlaceholder: 'Restrained, sensory, poetic',
    aiGenerate: 'Generate',
    aiGenerateConfirm: 'Replace and generate',
    aiGenerating: 'Generating…',
    deleteBody:
      'This cannot be undone. The copy, cover image and send history will be lost.',
    deleteConfirm: 'Delete permanently',
  },
} as const

const LIST_ROUTE = '/admin/newsletters'

/**
 * Standalone editor route (`/admin/newsletters/:id`). When id === 'new' the
 * form starts empty; the first Save creates the newsletter and swaps the URL
 * to its real id (via `navigate(..., { replace: true })`) so browser reload
 * keeps working. Every action network call has its own loading/error state.
 *
 * Unsaved work is protected three ways: a dirty flag (live form vs. the
 * last-saved snapshot), an in-app confirm before any deliberate navigation, and
 * a `beforeunload` guard for tab close / reload.
 */
export default function AdminNewsletterEditor() {
  const { id } = useParams<{ id: string }>()
  const { token } = useOutletContext<AdminCtx>()
  const navigate = useNavigate()
  const { language } = useLanguage()
  const copy = COPY[language] ?? COPY.fr
  const t = useTranslations(language, 'dashboard')
  const isNew = !id || id === 'new'

  const [newsletter, setNewsletter] = useState<NewsletterDto | null>(null)
  const [form, setForm] = useState<DraftForm>(empty)
  // Last state known to be persisted. The dirty flag is form ≠ snapshot.
  const [snapshot, setSnapshot] = useState<DraftForm>(empty)
  const [loading, setLoading] = useState(!isNew)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const [publishBusy, setPublishBusy] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Route the admin asked to go to while the form was dirty; the confirm modal
  // is open exactly while this is set.
  const [pendingLeave, setPendingLeave] = useState<string | null>(null)

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
  const [preview, setPreview] = useState<'fr' | 'en'>('fr')

  /** What the server worked out about the cover photograph on the last AI
   *  draft. Request-scoped, not persisted: `NewsletterDto` stores only the URL,
   *  so a reload legitimately loses the credit — which is why an admin who
   *  keeps an Unsplash cover should paste the credit into the copy if they want
   *  it to survive. Null before any draft, or after the URL is hand-edited. */
  const [coverInfo, setCoverInfo] = useState<{
    status: string
    note: string
    photographer: string
    photographerUrl: string
  } | null>(null)
  /** The cover URL is present but the browser could not load it. */
  const [coverFailed, setCoverFailed] = useState(false)

  /** Applies a server DTO as the new truth: form *and* snapshot, so a save,
   *  publish or send refresh clears the dirty flag. */
  const adoptDto = (n: NewsletterDto) => {
    const next = fromDto(n)
    setNewsletter(n)
    setForm(next)
    setSnapshot(next)
    // A load-failure flag belongs to the URL that failed, not to the editor, so
    // adopting a different cover must give the new one a chance to load.
    setCoverFailed(false)
  }

  // ---- Load existing newsletter -----------------------------------------

  useEffect(() => {
    if (isNew) {
      setNewsletter(null)
      setForm(empty)
      setSnapshot(empty)
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
        const next = fromDto(n)
        setNewsletter(n)
        setForm(next)
        setSnapshot(next)
      })
      .catch((e) => {
        if (!alive) return
        setLoadError(e instanceof Error ? e.message : COPY.fr.loadFailed)
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

  // ---- Dirty tracking ---------------------------------------------------

  const isDirty = useMemo(() => !sameForm(form, snapshot), [form, snapshot])

  // Tab close / reload / back-forward: the browser confirm is the only guard
  // available, and it must only be armed while there is something to lose.
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Legacy assignment kept for the browsers that still require it; the
      // string itself is never displayed.
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  /** Every deliberate exit goes through here: "← Retour", "Annuler", and
   *  "delete" on a newsletter that was never saved. */
  const requestLeave = (to: string) => {
    if (isDirty) {
      setPendingLeave(to)
      return
    }
    navigate(to)
  }

  const confirmLeave = () => {
    const to = pendingLeave
    setPendingLeave(null)
    // Clearing the snapshot mismatch first stops the beforeunload guard from
    // firing on the way out.
    setSnapshot(form)
    if (to) navigate(to)
  }

  // ---- Handlers ---------------------------------------------------------

  const setField = <K extends keyof DraftForm>(k: K, v: DraftForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const status: NewsletterDto['status'] = newsletter?.status ?? 'draft'
  const isSent = status === 'sent'

  const missingFields = REQUIRED_FIELDS.filter((f) => form[f.key].trim().length === 0)
  const canSave = missingFields.length === 0
  /** True when this field should show its inline "required" line: the admin has
   *  tried to save at least once and the field is still empty. */
  const invalid = (key: (typeof REQUIRED_FIELDS)[number]['key']) =>
    showValidation && form[key].trim().length === 0

  const handleSave = async () => {
    if (saving || isSent) return
    if (!canSave) {
      // Inline validation instead of a server-side banner: name the empty
      // fields and put the caret in the first one.
      setShowValidation(true)
      setSaveError(null)
      window.requestAnimationFrame(() => {
        document.getElementById(missingFields[0].id)?.focus()
      })
      return
    }
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
      const existing = newsletter
      const saved = existing
        ? await adminUpdateNewsletter(token, existing.id, payload)
        : await adminCreateNewsletter(token, payload)
      adoptDto(saved)
      setShowValidation(false)
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 2000)
      if (!existing) {
        // First save promoted /new → real id. Keep the browser location honest
        // without pushing a new history entry.
        navigate(`${LIST_ROUTE}/${saved.id}`, { replace: true })
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : copy.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    void handleSave()
  }

  // ⌘S / Ctrl+S submits from anywhere in the form. The handler is read through
  // a ref so the listener is attached once and never sees a stale closure.
  const saveShortcutRef = useRef<() => void>(() => {})
  useEffect(() => {
    saveShortcutRef.current = () => {
      // A modal owns the keyboard while it is open.
      if (aiOpen || deleteOpen || sendOpen || pendingLeave) return
      if (saving || isSent) return
      void handleSave()
    }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's') return
      e.preventDefault()
      saveShortcutRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleTogglePublish = async () => {
    if (!newsletter) return
    setPublishBusy(true)
    setPublishError(null)
    try {
      const next =
        newsletter.status === 'draft'
          ? await adminPublishNewsletter(token, newsletter.id)
          : await adminUnpublishNewsletter(token, newsletter.id)
      adoptDto(next)
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : copy.publishFailed)
    } finally {
      setPublishBusy(false)
    }
  }

  /** Opens the confirm dialog (nothing is deleted here). An unsaved newsletter
   *  has nothing on the server, so "delete" is just leaving the editor — which
   *  still has to go through the unsaved-changes guard. */
  const requestDelete = () => {
    if (!newsletter) {
      requestLeave(LIST_ROUTE)
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
      // The record is gone: nothing left to protect, so skip the dirty guard.
      setSnapshot(form)
      navigate(LIST_ROUTE)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t.newsletterDeleteFailed)
      setDeleteOpen(false)
    } finally {
      setDeleteBusy(false)
    }
  }

  const applyAiDraft = (draft: AiDraftResponse) => {
    // Keep what the server worked out about the photograph. The credit is a
    // requirement of Unsplash's API terms wherever the photo is shown, and the
    // note is the only thing that explains an empty URL (no API key, no match).
    setCoverInfo({
      status: draft.coverImageStatus ?? '',
      note: draft.coverImageNote ?? '',
      photographer: draft.coverImagePhotographer ?? '',
      photographerUrl: draft.coverImagePhotographerUrl ?? '',
    })
    setCoverFailed(false)
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

  // Cleared whenever the admin edits the URL by hand: the attribution belongs to
  // the photo the server resolved, and must not survive being pointed elsewhere.
  const clearCoverInfo = () => {
    setCoverInfo(null)
    setCoverFailed(false)
  }

  // True when generating would throw away copy the admin has already written.
  const hasUnsavedCopy = [form.titleFr, form.titleEn, form.bodyFr, form.bodyEn].some(
    (v) => v.trim().length > 0,
  )

  /** Maps a failed AI draft onto copy the admin can act on. 429 means the
   *  per-admin rate limit tripped; 502 means the upstream model answered but
   *  the draft was unusable (ai_parse_failed / ai_incomplete / ai_timeout). */
  const aiErrorMessage = (err: unknown): string => {
    const httpStatus = err instanceof ApiError ? err.status : null
    if (httpStatus === 429) return t.newsletterAiRateLimited
    if (httpStatus === 502) return t.newsletterAiUnusable
    return t.newsletterAiFailed
  }

  const handleAiGenerate = async () => {
    if (!aiBrief.trim()) {
      setAiError(copy.aiBriefRequired)
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

  const statusLabel: Record<NewsletterDto['status'], string> = {
    draft: t.newsletterStatusDraft,
    published: t.newsletterStatusPublished,
    sent: t.newsletterStatusSent,
  }

  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString(language === 'fr' ? 'fr-CH' : 'en-GB')
  }

  const audienceLine = audienceLoading
    ? copy.audienceLoading
    : audienceCount == null
      ? t.newsletterAudienceUnknown
      : audienceCount === 1
        ? t.newsletterSendRecipientCountOne
        : t.newsletterSendRecipientCount.replace('{count}', String(audienceCount))

  const requiredMark = (
    <span aria-hidden="true" style={{ color: 'var(--ad-coral, #ff6e50)' }}>
      {' '}{t.newsletterRequiredMark}
    </span>
  )

  // ---- Render -----------------------------------------------------------

  if (loading) {
    return (
      <>
        <div className="adash-head">
          <div>
            <p className="adash-kicker">{t.newsletterKicker}</p>
            <h2>{t.newsletterBusy}</h2>
          </div>
        </div>
        <p className="adash-loading" role="status" aria-live="polite">
          {copy.loadingBody}
        </p>
      </>
    )
  }

  if (loadError) {
    return (
      <>
        <div className="adash-head">
          <div>
            <p className="adash-kicker">{t.newsletterKicker}</p>
            <h2>{copy.notFoundTitle}</h2>
          </div>
        </div>
        <p className="adash-error" role="alert">{loadError}</p>
        <button
          type="button"
          className="adash-btn adash-btn-ghost"
          onClick={() => navigate(LIST_ROUTE)}
        >
          <span aria-hidden="true">←</span>
          {t.newslettersBack}
        </button>
      </>
    )
  }

  // isDirty is in here for a reason that is easy to miss: the send dispatches
  // server-side from the PERSISTED row, not from what is on screen. Allowing a
  // send with unsaved edits therefore mailed the old text, and the post-send
  // refetch then overwrote the editor (form *and* snapshot) with the server
  // copy — so the pending edits were mailed-around and then silently discarded.
  const sendDisabled =
    isSent ||
    status !== 'published' ||
    publishBusy ||
    saving ||
    deleteBusy ||
    isDirty ||
    audienceCount == null

  // One line explains, at all times, why the send button is in the state it is.
  // When the newsletter has already been sent the explanation is the read-only
  // notice printed once at the top of the page, so the button points at that
  // node instead of repeating the sentence here.
  const sendExplainer = isSent
    ? null
    : status !== 'published'
      ? t.newsletterSendNeedsPublish
      : isDirty
        ? t.newsletterSendNeedsSave
        : audienceUnknown
          ? t.newsletterAudienceUnknown
          : t.newsletterSendIrreversible
  const sendDescribedBy = isSent ? 'nl-sent-notice' : 'nl-send-explainer'

  return (
    <>
      <div className="adash-head">
        <div>
          <p className="adash-kicker">{t.newsletterKicker}</p>
          <h2>
            {newsletter
              ? newsletter.titleFr || t.newsletterUntitled
              : t.newsletterListEmptyCta}
          </h2>
          <p>
            <span className={`adash-pill is-${status}`}>{statusLabel[status]}</span>
            {newsletter?.publishedAt && (
              <> · {t.newslettersPublishedOn.replace('{date}', fmtDate(newsletter.publishedAt))}</>
            )}
            {newsletter?.lastSentAt && (
              <> · {copy.sentOn.replace('{date}', fmtDate(newsletter.lastSentAt))}</>
            )}
          </p>
        </div>
        <div className="adash-head-actions">
          <button
            type="button"
            className="adash-btn adash-btn-ghost"
            onClick={() => requestLeave(LIST_ROUTE)}
          >
            <span aria-hidden="true">←</span>
            {t.newslettersBack}
          </button>
        </div>
      </div>

      {/* Why every field below is greyed out. Previously the only cue was the
          status pill. */}
      {isSent && (
        <p className="adash-hint" id="nl-sent-notice" style={{ margin: 0 }}>
          {t.newsletterSentReadOnly}
        </p>
      )}

      {saveError && <p className="adash-error" role="alert">{saveError}</p>}
      {deleteError && <p className="adash-error" role="alert">{deleteError}</p>}
      {publishError && <p className="adash-error" role="alert">{publishError}</p>}
      {audienceError && <p className="adash-hint warn">{audienceError}</p>}

      {/* noValidate: the browser must not pre-empt the inline validation below
          with its own bubbles, but `required` stays for assistive tech. */}
      <form onSubmit={handleSubmit} noValidate style={FORM_STACK}>
        <div className="adash-panel">
          <div className="adash-panel-head">
            <h3>{t.newsletterPanelDraftingTitle}</h3>
            <button
              type="button"
              className="adash-btn adash-btn-ghost adash-btn-sm"
              onClick={() => { setAiError(null); setAiConfirmOverwrite(false); setAiOpen(true) }}
              disabled={isSent}
            >
              {copy.aiCta}
            </button>
          </div>
          <p style={{ margin: 0, color: MUTED }}>
            {copy.aiPanelBody}
            {form.aiDrafted && form.sourceBrief && (
              <>
                {' '}{copy.aiLastBrief} : <em>“{form.sourceBrief}”</em>.
              </>
            )}
          </p>
        </div>

        <div className="adash-panel">
          <div className="adash-panel-head">
            <h3>{t.newsletterPanelMetadataTitle}</h3>
          </div>
          <div className="adash-form-grid">
            <div className="adash-field">
              <label htmlFor="nl-tag">{t.newsletterFieldTag}</label>
              <input
                id="nl-tag"
                className="adash-input"
                value={form.tag}
                onChange={(e) => setField('tag', e.target.value)}
                placeholder={copy.tagPlaceholder}
                disabled={isSent}
              />
            </div>
            <div className="adash-field">
              <label htmlFor="nl-image-keyword">{t.newsletterFieldImageKeyword}</label>
              <input
                id="nl-image-keyword"
                className="adash-input"
                value={form.coverImageKeyword}
                onChange={(e) => setField('coverImageKeyword', e.target.value)}
                placeholder={copy.keywordPlaceholder}
                disabled={isSent}
              />
            </div>
            <div className="adash-field full">
              <label htmlFor="nl-cover-url">{t.newsletterFieldCoverUrl}</label>
              <input
                id="nl-cover-url"
                className="adash-input"
                value={form.coverImageUrl}
                onChange={(e) => {
                  setField('coverImageUrl', e.target.value)
                  // A hand-typed URL is not the photo the server resolved, so
                  // its attribution must not follow it.
                  clearCoverInfo()
                }}
                placeholder={copy.coverUrlPlaceholder}
                aria-describedby="nl-cover-url-hint"
                disabled={isSent}
              />
              <span className="adash-hint" id="nl-cover-url-hint">{copy.coverHint}</span>
            </div>
            <div className="adash-field full">
              {/* No cover is an explicit state, not a placeholder image. This
                  used to render DEFAULT_COVER, a file that is not in
                  public/images, so "no cover yet" looked like a broken editor. */}
              <div
                style={{
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: 'rgba(255,255,255,0.04)',
                  aspectRatio: '2 / 1',
                  maxWidth: 520,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: form.coverImageUrl && !coverFailed ? 0 : 18,
                  textAlign: 'center',
                }}
              >
                {form.coverImageUrl && !coverFailed ? (
                  <img
                    src={form.coverImageUrl}
                    alt={copy.coverAlt}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={() => setCoverFailed(true)}
                  />
                ) : (
                  <p className="adash-hint" style={{ margin: 0 }}>
                    {coverFailed
                      ? t.newsletterCoverFailed
                      : /* The server's own sentence when it has one — it knows
                           whether the key is missing, the search missed, or the
                           lookup failed — otherwise the plain empty state. */
                        coverInfo?.note || t.newsletterCoverNone}
                    {!coverFailed && form.coverImageKeyword.trim() && (
                      <>
                        {' '}
                        {t.newsletterCoverSearchHint.replace(
                          '{keyword}',
                          form.coverImageKeyword.trim(),
                        )}
                      </>
                    )}
                  </p>
                )}
              </div>
              {/* Unsplash's API terms require the photographer to be credited
                  wherever the photo is shown. Rendered only for a photo the
                  server actually resolved. */}
              {form.coverImageUrl && !coverFailed && coverInfo?.photographer && (
                <span className="adash-hint">
                  {coverInfo.photographerUrl ? (
                    <a
                      className="adash-link"
                      href={coverInfo.photographerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t.newsletterCoverCredit.replace('{name}', coverInfo.photographer)}
                    </a>
                  ) : (
                    t.newsletterCoverCredit.replace('{name}', coverInfo.photographer)
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="adash-panel">
          <div className="adash-panel-head">
            <h3>{t.newsletterPanelFrenchTitle}</h3>
          </div>
          <div className="adash-form-grid">
            <div className="adash-field full">
              <label htmlFor="nl-title-fr">
                {t.newsletterFieldTitleFr}{requiredMark}
              </label>
              <input
                id="nl-title-fr"
                className="adash-input"
                value={form.titleFr}
                onChange={(e) => setField('titleFr', e.target.value)}
                disabled={isSent}
                required
                aria-invalid={invalid('titleFr') || undefined}
                aria-describedby={invalid('titleFr') ? 'nl-title-fr-error' : undefined}
              />
              {invalid('titleFr') && (
                <span className="adash-hint warn" id="nl-title-fr-error" role="alert">
                  {t.newsletterFieldRequired}
                </span>
              )}
            </div>
            <div className="adash-field full">
              <label htmlFor="nl-body-fr">
                {t.newsletterFieldBodyFr}{requiredMark}
              </label>
              <textarea
                id="nl-body-fr"
                className="adash-input adash-textarea"
                rows={12}
                value={form.bodyFr}
                onChange={(e) => setField('bodyFr', e.target.value)}
                disabled={isSent}
                required
                aria-invalid={invalid('bodyFr') || undefined}
                aria-describedby={
                  invalid('bodyFr') ? 'nl-body-fr-error nl-body-fr-count' : 'nl-body-fr-count'
                }
              />
              {invalid('bodyFr') && (
                <span className="adash-hint warn" id="nl-body-fr-error" role="alert">
                  {t.newsletterFieldRequired}
                </span>
              )}
              <span className="adash-hint" id="nl-body-fr-count">
                {copy.wordCount.replace('{n}', String(wordCountFr))} · {copy.markdownHint}
              </span>
            </div>
          </div>
        </div>

        <div className="adash-panel">
          <div className="adash-panel-head">
            <h3>{t.newsletterPanelEnglishTitle}</h3>
          </div>
          <div className="adash-form-grid">
            <div className="adash-field full">
              <label htmlFor="nl-title-en">
                {t.newsletterFieldTitleEn}{requiredMark}
              </label>
              <input
                id="nl-title-en"
                className="adash-input"
                value={form.titleEn}
                onChange={(e) => setField('titleEn', e.target.value)}
                disabled={isSent}
                required
                aria-invalid={invalid('titleEn') || undefined}
                aria-describedby={invalid('titleEn') ? 'nl-title-en-error' : undefined}
              />
              {invalid('titleEn') && (
                <span className="adash-hint warn" id="nl-title-en-error" role="alert">
                  {t.newsletterFieldRequired}
                </span>
              )}
            </div>
            <div className="adash-field full">
              <label htmlFor="nl-body-en">
                {t.newsletterFieldBodyEn}{requiredMark}
              </label>
              <textarea
                id="nl-body-en"
                className="adash-input adash-textarea"
                rows={12}
                value={form.bodyEn}
                onChange={(e) => setField('bodyEn', e.target.value)}
                disabled={isSent}
                required
                aria-invalid={invalid('bodyEn') || undefined}
                aria-describedby={
                  invalid('bodyEn') ? 'nl-body-en-error nl-body-en-count' : 'nl-body-en-count'
                }
              />
              {invalid('bodyEn') && (
                <span className="adash-hint warn" id="nl-body-en-error" role="alert">
                  {t.newsletterFieldRequired}
                </span>
              )}
              <span className="adash-hint" id="nl-body-en-count">
                {copy.wordCount.replace('{n}', String(wordCountEn))} · {copy.markdownHint}
              </span>
            </div>
          </div>
        </div>

        <div className="adash-panel">
          <div className="adash-panel-head">
            <h3>{t.newsletterPanelPreviewTitle}</h3>
            {/* A segmented control, not a pair of buttons: `.adash-seg` styles
                the selected segment off `aria-pressed`, so the state the screen
                reader gets and the state the eye gets are the same attribute.
                This used to borrow the primary/ghost button pair plus an inline
                borderColor, which put a second primary on the page. */}
            <div className="adash-seg adash-seg-sm" role="group">
              <button
                type="button"
                onClick={() => setPreview('fr')}
                aria-pressed={preview === 'fr'}
                aria-label={t.newsletterPanelFrenchTitle}
              >
                FR
              </button>
              <button
                type="button"
                onClick={() => setPreview('en')}
                aria-pressed={preview === 'en'}
                aria-label={t.newsletterPanelEnglishTitle}
              >
                EN
              </button>
            </div>
          </div>
          <div className="adash-panel adash-panel-flush adash-preview">
            {previewTitle && <h2 style={{ marginTop: 0 }}>{previewTitle}</h2>}
            {previewBody ? (
              <ReactMarkdown>{previewBody}</ReactMarkdown>
            ) : (
              <p style={{ margin: 0, color: MUTED }}>
                <em>{copy.previewEmpty}</em>
              </p>
            )}
          </div>
        </div>

        <div className="adash-panel">
          <div className="adash-panel-head">
            <h3>{t.newsletterPanelActionsTitle}</h3>
            <p
              className={`adash-hint${audienceUnknown ? ' warn' : ''}`}
              style={{ margin: 0 }}
              role="status"
              aria-live="polite"
            >
              {audienceLine}
            </p>
          </div>

          {/* Consequential action, kept in its own bordered group above the
              divider so it is never adjacent to Save. */}
          <div className="adash-send-zone">
            {sendExplainer && (
              <p
                className="adash-hint"
                id="nl-send-explainer"
                style={{ margin: 0, flex: '1 1 240px' }}
              >
                {sendExplainer}
              </p>
            )}
            <button
              type="button"
              className="adash-btn adash-btn-danger"
              onClick={() => setSendOpen(true)}
              // Always mounted so the gate is visible on a draft; never opens
              // mid-mutation, and never with an unresolved audience — the
              // dialog would sit on "counting recipients" forever.
              disabled={sendDisabled}
              aria-describedby={sendDescribedBy}
              style={{ marginLeft: 'auto' }}
            >
              {t.newsletterSendAllAction}
            </button>
          </div>
        </div>

        {/* Routine actions, pinned to the viewport bottom. Exactly one primary
            (Save), and no send affordance anywhere near it. */}
        <div className="adash-detail-foot adash-sticky-foot">
          <button
            type="button"
            className="adash-btn adash-btn-danger adash-btn-sm"
            onClick={requestDelete}
            disabled={deleteBusy || saving || isSent}
          >
            {deleteBusy ? t.newsletterDeleting : t.newsletterDelete}
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {newsletter && !isSent && (
              <button
                type="button"
                className="adash-btn adash-btn-ghost"
                onClick={handleTogglePublish}
                disabled={publishBusy}
                aria-pressed={status === 'published'}
              >
                {publishBusy
                  ? t.newsletterPublishing
                  : status === 'draft'
                    ? t.newsletterPublish
                    : t.newsletterUnpublish}
              </button>
            )}
            <button
              type="button"
              className="adash-btn adash-btn-ghost"
              onClick={() => requestLeave(LIST_ROUTE)}
            >
              {t.newsletterCancel}
            </button>
            <button
              type="submit"
              className="adash-btn adash-btn-primary"
              disabled={saving || isSent}
            >
              {saving
                ? t.newsletterSaving
                : savedFlash
                  ? `${t.newsletterSaved} ✓`
                  : t.newsletterSave}
            </button>
          </div>
        </div>
      </form>

      {aiOpen && (
        <AdminModal titleId="adm-ai-draft" onClose={closeAiModal}>
          <div className="adash-modal-head">
            <div>
              <h2 id="adm-ai-draft">{copy.aiCta}</h2>
              <p>{copy.aiModalSubtitle}</p>
            </div>
            <button
              type="button"
              className="adash-modal-close"
              onClick={closeAiModal}
              aria-label={t.newsletterClose}
            >
              ×
            </button>
          </div>
          <div className="adash-form-grid">
            <div className="adash-field full">
              <label htmlFor="nl-ai-brief">
                {copy.aiBriefLabel}{requiredMark}
              </label>
              <textarea
                id="nl-ai-brief"
                className="adash-input adash-textarea"
                rows={3}
                value={aiBrief}
                onChange={(e) => setAiBrief(e.target.value)}
                placeholder={copy.aiBriefPlaceholder}
                maxLength={500}
                required
                aria-describedby="nl-ai-brief-count"
              />
              <span className="adash-hint" id="nl-ai-brief-count">
                {copy.aiBriefCount.replace('{n}', String(aiBrief.length))}
              </span>
            </div>
            <div className="adash-field full">
              <label htmlFor="nl-ai-tone">{copy.aiToneLabel}</label>
              <input
                id="nl-ai-tone"
                className="adash-input"
                value={aiTone}
                onChange={(e) => setAiTone(e.target.value)}
                placeholder={copy.aiTonePlaceholder}
              />
            </div>
          </div>
          {aiConfirmOverwrite && (
            <p className="adash-hint warn" role="alert">
              {t.newsletterAiOverwriteConfirm}
            </p>
          )}
          {aiError && <p className="adash-error" role="alert">{aiError}</p>}
          <div className="adash-detail-foot">
            <button
              type="button"
              className="adash-btn adash-btn-ghost"
              onClick={closeAiModal}
              disabled={aiBusy}
            >
              {t.newsletterCancel}
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

      {pendingLeave && (
        <AdminModal titleId="adm-unsaved-newsletter" onClose={() => setPendingLeave(null)}>
          <div className="adash-modal-head">
            <div>
              <h2 id="adm-unsaved-newsletter">{t.newsletterUnsavedTitle}</h2>
              <p>{form.titleFr || newsletter?.titleFr || t.newsletterUntitled}</p>
            </div>
            <button
              type="button"
              className="adash-modal-close"
              onClick={() => setPendingLeave(null)}
              aria-label={t.newsletterClose}
            >
              ×
            </button>
          </div>
          <p className="adash-hint warn" style={{ margin: 0 }}>
            {t.newsletterUnsavedBody}
          </p>
          <div className="adash-detail-foot">
            <button
              type="button"
              className="adash-btn adash-btn-primary"
              onClick={() => setPendingLeave(null)}
            >
              {t.newsletterUnsavedStay}
            </button>
            <button
              type="button"
              className="adash-btn adash-btn-danger"
              onClick={confirmLeave}
              style={{ marginLeft: 'auto' }}
            >
              {t.newsletterUnsavedLeave}
            </button>
          </div>
        </AdminModal>
      )}

      {deleteOpen && newsletter && (
        <AdminModal titleId="adm-delete-newsletter" onClose={() => setDeleteOpen(false)}>
          <div className="adash-modal-head">
            <div>
              <h2 id="adm-delete-newsletter">{t.newsletterDeleteConfirm}</h2>
              <p>{newsletter.titleFr || t.newsletterUntitled}</p>
            </div>
            <button
              type="button"
              className="adash-modal-close"
              onClick={() => setDeleteOpen(false)}
              aria-label={t.newsletterClose}
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
              {t.newsletterCancel}
            </button>
            <button
              type="button"
              className="adash-btn adash-btn-danger"
              onClick={handleDelete}
              disabled={deleteBusy}
              style={{ marginLeft: 'auto' }}
            >
              {deleteBusy ? t.newsletterDeleting : copy.deleteConfirm}
            </button>
          </div>
        </AdminModal>
      )}

      {/* The send receipt lives in this modal only — the editor used to render a
          second copy of the same counts as a page banner. */}
      {sendOpen && newsletter && (
        <NewsletterSendConfirmModal
          token={token}
          newsletter={newsletter}
          audienceCount={audienceCount}
          // Resolved server-side on the detail read; the dialog falls back to
          // the published address only when this is absent.
          senderAddress={newsletter.senderAddress}
          onClose={() => setSendOpen(false)}
          onSent={() => {
            // Refresh the newsletter — status may have flipped to "sent".
            adminGetNewsletter(token, newsletter.id)
              .then(adoptDto)
              .catch(() => { /* the modal's receipt already tells the story */ })
          }}
        />
      )}
    </>
  )
}
