import { useMemo, useState } from 'react'
import {
  ApiError,
  adminSendNewsletter,
  type NewsletterDto,
  type NewsletterSendAuditDto,
} from '../../lib/api'
import { useLanguage } from '../../contexts/LanguageContext'
import { useTranslations } from '../../lib/translations'
import AdminModal from './AdminModal'

/**
 * Confirmation dialog for sending a newsletter. Two safety gates before the
 * primary button becomes clickable:
 *   1) the admin ticks a “I understand” checkbox, or
 *   2) the admin retypes the newsletter's French title verbatim.
 *
 * Either gate is enough. This mirrors the destructive-confirm patterns already
 * in use elsewhere in the console while sticking to `adash-*` primitives.
 *
 * On success the modal replaces its body with a summary panel reporting the
 * queued / delivered / failed counts (plus the collapsed list of failures).
 */

/** Deliberately loose “looks like an address” check — the API is the real
 *  validator. It only has to reject the junk that used to slip through
 *  (`,,,;`, bare words, `a@b`), so the modal never posts an empty test send. */
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/

/** Splits the raw textarea on commas / semicolons / whitespace, keeps only
 *  plausible `x@y.z` addresses and dedupes case-insensitively, preserving the
 *  first spelling the admin typed. Returns `[]` when nothing is usable. */
const parseTestEmails = (raw: string): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const chunk of (raw ?? '').split(/[,\s;]+/)) {
    const value = chunk.trim()
    if (!EMAIL_RE.test(value)) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

/** Shape-check for a `SendAuditDto` that rode along on a non-2xx response.
 *  The backend answers a total send failure with HTTP 502 *and* an audit body,
 *  but `jsonRequest` in `lib/api.ts` collapses any non-2xx into an `ApiError`
 *  carrying only `status` / `message` / `errorType` — the body is dropped.
 *  This duck-types the payload off the error anyway, so the counts light up for
 *  free if api.ts later starts attaching it; until then it returns null and the
 *  modal falls back to the explicit “all sends failed” panel. */
const auditFromError = (err: unknown): NewsletterSendAuditDto | null => {
  if (!err || typeof err !== 'object') return null
  for (const key of ['data', 'body', 'payload', 'details']) {
    const candidate = (err as Record<string, unknown>)[key]
    if (!candidate || typeof candidate !== 'object') continue
    const audit = candidate as Partial<NewsletterSendAuditDto>
    if (
      typeof audit.totalRecipients === 'number' &&
      typeof audit.sent === 'number' &&
      typeof audit.failed === 'number'
    ) {
      return {
        ...(audit as NewsletterSendAuditDto),
        failedRecipients: Array.isArray(audit.failedRecipients) ? audit.failedRecipients : [],
        errors: Array.isArray(audit.errors) ? audit.errors : [],
      }
    }
  }
  return null
}

/** Copy added by this modal. The console is otherwise hard-coded French; these
 *  three strings are read from the shared dictionary (with the French text
 *  below as the fallback) because they also exist as `newsletter*` keys there. */
const FALLBACK = {
  fr: {
    testEmailsInvalid: 'Aucune adresse valide détectée.',
    sendAllFailed: "Tous les envois ont échoué. Consultez le journal d'envoi.",
    audienceUnknown: 'Nombre de destinataires indisponible.',
  },
  en: {
    testEmailsInvalid: 'No valid address detected.',
    sendAllFailed: 'All sends failed. Check the send log.',
    audienceUnknown: 'Recipient count unavailable.',
  },
} as const

type SharedKey =
  | 'newsletterTestEmailsInvalid'
  | 'newsletterSendAllFailed'
  | 'newsletterAudienceUnknown'

export default function NewsletterSendConfirmModal({
  token,
  newsletter,
  audienceCount,
  audienceLoading = false,
  onClose,
  onSent,
}: {
  token: string
  newsletter: NewsletterDto
  /** Audience size resolved by the caller. Optional and nullable on purpose:
   *  the editor may pass a freshly fetched count, `newsletter.audienceCount`,
   *  or nothing at all when its fetch failed — see `resolvedAudience`. */
  audienceCount?: number | null
  /** True only while the caller's count request is still in flight. Anything
   *  else (fetch failed, never attempted) renders the unknown state instead of
   *  a loading message that would otherwise never resolve. */
  audienceLoading?: boolean
  onClose: () => void
  onSent: (audit: NewsletterSendAuditDto) => void
}) {
  const { language } = useLanguage()
  // Tolerate the keys being absent so the modal keeps working whichever way
  // translations.ts lands, exactly like AdminNewsletterEditor does.
  const shared = useTranslations(language, 'dashboard') as unknown as Partial<
    Record<SharedKey, string>
  >
  const fallback = FALLBACK[language] ?? FALLBACK.fr
  const testEmailsInvalidText =
    shared.newsletterTestEmailsInvalid ?? fallback.testEmailsInvalid
  const sendAllFailedText = shared.newsletterSendAllFailed ?? fallback.sendAllFailed
  const audienceUnknownText =
    shared.newsletterAudienceUnknown ?? fallback.audienceUnknown

  const [confirmed, setConfirmed] = useState(false)
  const [typed, setTyped] = useState('')
  const [testEmails, setTestEmails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<NewsletterSendAuditDto | null>(null)
  /** Set when every batch failed (HTTP 502) and no audit body was reachable. */
  const [sendFailure, setSendFailure] = useState<{ status: number; message: string } | null>(
    null,
  )

  const titleTarget = (newsletter.titleFr ?? '').trim()
  const titleMatches = useMemo(
    () => typed.trim().length > 0 && typed.trim() === titleTarget,
    [typed, titleTarget],
  )

  // Test mode is driven by the PARSED list, never by the raw string: `",,,;"`
  // is "something typed" but parses to nothing, and posting `{ testEmails: [] }`
  // used to dispatch a full member send under a test-send label.
  const testRecipients = useMemo(() => parseTestEmails(testEmails), [testEmails])
  const isTestMode = testRecipients.length > 0
  const testEmailsInvalid = testEmails.trim().length > 0 && !isTestMode

  /** Prefer the caller's count, fall back to the value carried on the DTO, and
   *  only then admit we don't know. Guards against `null`, `undefined` and the
   *  `NaN` a failed parse upstream could hand us. */
  const resolvedAudience = useMemo(() => {
    for (const candidate of [audienceCount, newsletter.audienceCount]) {
      if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
        return candidate
      }
    }
    return null
  }, [audienceCount, newsletter.audienceCount])

  // Test sends skip the safety gates — nothing goes to real members.
  const gatePassed = isTestMode || confirmed || titleMatches
  const disabled = busy || testEmailsInvalid || !gatePassed

  const handleSend = async () => {
    if (testEmailsInvalid) return
    setBusy(true)
    setError(null)
    setSendFailure(null)
    try {
      const body = isTestMode ? { testEmails: testRecipients } : {}
      const audit = await adminSendNewsletter(token, newsletter.id, body)
      setResult(audit)
      onSent(audit)
    } catch (err) {
      const audit = auditFromError(err)
      if (audit) {
        // Same counts UI as a partial success. `onSent` stays uncalled: nothing
        // was delivered, so the parent must not treat this as a completed send.
        setResult(audit)
      } else if (err instanceof ApiError && err.status === 502) {
        setSendFailure({ status: err.status, message: err.message })
      } else {
        setError(err instanceof Error ? err.message : 'Failed to send newsletter')
      }
    } finally {
      setBusy(false)
    }
  }

  const allFailed = !!result && result.sent === 0 && result.failed > 0
  const summaryOpen = !!result || !!sendFailure

  return (
    <AdminModal titleId="adm-send-newsletter" onClose={onClose}>
      <div className="adash-modal-head">
        <div>
          <h2 id="adm-send-newsletter">
            {summaryOpen ? 'Envoi terminé' : 'Envoyer maintenant ?'}
          </h2>
          <p>{newsletter.titleFr || '(sans titre)'}</p>
        </div>
        <button
          type="button"
          className="adash-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {summaryOpen ? (
        <>
          <div
            className="adash-creds"
            role={result && !allFailed ? 'status' : 'alert'}
            aria-live="polite"
          >
            {result ? (
              <>
                <h3>
                  {allFailed
                    ? sendAllFailedText
                    : result.testMode
                      ? 'Envoi de test terminé.'
                      : `${result.sent} membre${result.sent === 1 ? '' : 's'} atteint${result.sent === 1 ? '' : 's'}.`}
                </h3>
                <div className="adash-cred-row">
                  <div>
                    <span>En file d'attente</span>
                    <strong className="adash-mono">{result.totalRecipients}</strong>
                  </div>
                  <div>
                    <span>Livrés</span>
                    <strong className="adash-mono">{result.sent}</strong>
                  </div>
                  <div>
                    <span>Échecs</span>
                    <strong className="adash-mono">{result.failed}</strong>
                  </div>
                </div>
                {result.failed > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary>Adresses en échec ({result.failedRecipients.length})</summary>
                    <ul className="adash-mono" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                      {result.failedRecipients.map((addr) => (
                        <li key={addr}>{addr}</li>
                      ))}
                    </ul>
                    {result.errors.length > 0 && (
                      <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                        {result.errors.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </details>
                )}
              </>
            ) : (
              <>
                {/* Total failure without a readable audit body: the counts are
                    not recoverable from `ApiError` today, so name the outcome
                    and point at the send log. */}
                <h3>{sendAllFailedText}</h3>
                <div className="adash-cred-row">
                  <div>
                    <span>Code HTTP</span>
                    <strong className="adash-mono">{sendFailure?.status}</strong>
                  </div>
                </div>
                {sendFailure?.message && (
                  <p className="adash-hint warn" style={{ margin: '8px 0 0' }}>
                    {sendFailure.message}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="adash-detail-foot">
            <button
              type="button"
              className="adash-btn adash-btn-primary"
              onClick={onClose}
              style={{ marginLeft: 'auto' }}
            >
              Fermer
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="adash-form-grid">
            <div className="adash-field full">
              <p style={{ margin: 0 }}>
                {resolvedAudience == null ? (
                  audienceLoading ? (
                    <em>Chargement du nombre de destinataires…</em>
                  ) : (
                    <em className="adash-hint warn">{audienceUnknownText}</em>
                  )
                ) : (
                  <>
                    Cette infolettre sera envoyée à{' '}
                    <strong>
                      {resolvedAudience} membre{resolvedAudience === 1 ? '' : 's'}
                    </strong>{' '}
                    actif{resolvedAudience === 1 ? '' : 's'} abonné
                    {resolvedAudience === 1 ? '' : 's'}.
                  </>
                )}
              </p>
            </div>
            <div className="adash-field full">
              <label>Adresses de test (séparées par des virgules)</label>
              <textarea
                className="adash-input adash-textarea"
                rows={2}
                value={testEmails}
                onChange={(e) => setTestEmails(e.target.value)}
                placeholder="editorial@pavillon46.ch, kia@bonapp.group"
                aria-invalid={testEmailsInvalid || undefined}
              />
              {testEmailsInvalid ? (
                <span className="adash-hint warn">{testEmailsInvalidText}</span>
              ) : (
                <span className="adash-hint">
                  Si renseigné, l'infolettre n'est envoyée qu'à ces adresses. Le statut ne
                  change pas.
                </span>
              )}
            </div>

            {!isTestMode && (
              <>
                <div className="adash-field full">
                  <label className="adash-check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    <span>Je confirme envoyer cette infolettre à tous les membres actifs.</span>
                  </label>
                </div>
                <div className="adash-field full">
                  <label>Ou saisissez le titre exact pour confirmer</label>
                  <input
                    className="adash-input"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={titleTarget}
                    aria-label="Saisir le titre exact"
                  />
                  {typed.length > 0 && !titleMatches && (
                    <span className="adash-hint warn">
                      Le titre saisi ne correspond pas.
                    </span>
                  )}
                </div>
                <div className="adash-field full">
                  <p className="adash-hint warn" style={{ margin: 0 }}>
                    Cette action n'est pas réversible.
                  </p>
                </div>
              </>
            )}
          </div>

          {error && <p className="adash-error">{error}</p>}

          <div className="adash-detail-foot">
            <button
              type="button"
              className="adash-btn adash-btn-ghost"
              onClick={onClose}
              disabled={busy}
            >
              Annuler
            </button>
            <button
              type="button"
              className="adash-btn adash-btn-primary"
              onClick={handleSend}
              disabled={disabled}
              style={{ marginLeft: 'auto' }}
            >
              {busy
                ? 'Envoi…'
                : isTestMode
                  ? `Envoyer le test (${testRecipients.length})`
                  : 'Envoyer aux membres'}
            </button>
          </div>
        </>
      )}
    </AdminModal>
  )
}
