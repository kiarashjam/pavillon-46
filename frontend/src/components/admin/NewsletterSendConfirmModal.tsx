import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  adminListMembers,
  adminResendFailedNewsletter,
  adminSendNewsletter,
  type MemberDto,
  type NewsletterDto,
  type NewsletterSendResultDto,
} from '../../lib/api'
import { useLanguage } from '../../contexts/LanguageContext'
import { useTranslations } from '../../lib/translations'
import AdminModal from './AdminModal'

/**
 * Send-confirmation dialog — the gate in front of the one action in the console
 * that cannot be taken back.
 *
 * Shape of the flow, deliberately in this order:
 *
 *   1. A summary of *what is going out*: the exact subject each language group
 *      will see in their inbox, the sender address, the audience total, the
 *      FR/EN split, the inspectable recipient list, and the standing
 *      “a send cannot be undone” warning.
 *   2. The choice of *how* to send, as a segmented control that defaults to the
 *      SAFE option: `test` first, `all` second. Test-send used to be a textarea
 *      buried under a dialog titled “Send now?”, i.e. the safe path was the
 *      hidden one.
 *   3. The gates for the irreversible option only (checkbox OR retyped title).
 *
 * The two mode panels are both mounted for the whole life of the dialog and
 * stacked into a single CSS-grid cell, so the container is always as tall as the
 * taller panel and switching modes moves nothing: the footer button cannot slide
 * under the pointer between the mousedown and the click. The inactive layer is
 * `visibility: hidden` *and* its controls are `disabled`, which keeps it out of
 * the accessibility tree and out of AdminModal's focus trap (that trap filters
 * on `[disabled]`), without giving up the reserved space.
 *
 * Outcome rendering follows the backend contract in `SendAuditDto`: a dispatch
 * that ran answers **200** with the full audit plus `ok` / `outcome`
 * (`"sent" | "partial" | "all_failed"`), so a total failure is a readable
 * receipt instead of an unreadable 502. All three outcomes report counts, and a
 * failure lists who missed out and offers the resend.
 *
 * Focus is moved deliberately on every body swap — onto the outcome region when
 * a receipt lands, back onto the mode selector when a *test* receipt is
 * dismissed — because both swaps unmount the button that had focus, which
 * otherwise drops the admin at the top of the page behind the dialog.
 * AdminModal's focus trap, Escape handling and focus restore are left exactly as
 * they are; the only thing done for them is handing them a reference-stable
 * `onClose` (see `stableClose`) so they are installed once instead of being torn
 * down and reinstalled — with the focus theft that implies — every time the
 * parent re-renders.
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

type SendOutcome = 'sent' | 'partial' | 'all_failed'

/** The send/resend response. `NewsletterSendResultDto` in `lib/api.ts` now
 *  carries the whole 200-with-audit shape, so this is a plain alias — but the
 *  discriminator fields stay *optional* here on purpose: a browser holding a
 *  cached bundle can be talking to an older API build that answers without
 *  `outcome`/`ok`, and `outcomeOf` below is what makes that render correctly
 *  instead of throwing. */
export type SendAudit = Omit<NewsletterSendResultDto, 'outcome' | 'ok' | 'kind' | 'failedTotal'> &
  Partial<Pick<NewsletterSendResultDto, 'outcome' | 'ok' | 'kind' | 'failedTotal'>>

/** Trust the server's discriminator when it is there, derive it from the counts
 *  when it is not, so an older API build still renders the right panel. */
const outcomeOf = (audit: SendAudit): SendOutcome => {
  if (audit.outcome === 'sent' || audit.outcome === 'partial' || audit.outcome === 'all_failed') {
    return audit.outcome
  }
  if (!(audit.failed > 0)) return 'sent'
  return audit.sent > 0 ? 'partial' : 'all_failed'
}

/** Never let a missing array crash the receipt: the lists are what the admin
 *  needs most precisely when the send went wrong. */
const normalizeAudit = (audit: SendAudit): SendAudit => ({
  ...audit,
  sent: Number.isFinite(audit.sent) ? audit.sent : 0,
  failed: Number.isFinite(audit.failed) ? audit.failed : 0,
  totalRecipients: Number.isFinite(audit.totalRecipients) ? audit.totalRecipients : 0,
  failedRecipients: Array.isArray(audit.failedRecipients) ? audit.failedRecipients : [],
  failedRecipientIds: Array.isArray(audit.failedRecipientIds) ? audit.failedRecipientIds : [],
  errors: Array.isArray(audit.errors) ? audit.errors : [],
})

/** Strings this dialog needs that have no key in `translations.ts` yet. Every
 *  other piece of copy comes from the dictionary; these are listed in the report
 *  so they can be promoted to real keys. */
const COPY = {
  fr: {
    sending: 'Envoi…',
    resending: 'Renvoi…',
    confirmCheckbox: 'Je confirme envoyer cette infolettre à tous les membres actifs.',
    titleMismatch: 'Le titre saisi ne correspond pas.',
    testDone: 'Envoi de test terminé.',
    breakdownLabel: 'Répartition par langue',
    failedLabel: 'Échecs',
    backToOptions: "Revenir aux options d'envoi",
  },
  en: {
    sending: 'Sending…',
    resending: 'Resending…',
    confirmCheckbox: 'I confirm sending this newsletter to every active member.',
    titleMismatch: 'The title typed does not match.',
    testDone: 'Test send complete.',
    breakdownLabel: 'Breakdown by language',
    failedLabel: 'Failed',
    backToOptions: 'Back to the send options',
  },
} as const

/** Last-resort sender label. `NewsletterDto.senderAddress` carries the server's
 *  real resolved `FROM_EMAIL` on the detail read, so this is only reached when
 *  the caller has no DTO field to pass — an older API build, or a caller that
 *  loaded the newsletter from the list endpoint. It is the address the site
 *  publishes in its legal copy, not a guess at runtime state. */
const DEFAULT_SENDER = 'contact@pavillon46.ch'

const isEligible = (m: MemberDto) =>
  (m.status ?? '').toLowerCase() === 'active' &&
  !m.newsletterOptOut &&
  typeof m.email === 'string' &&
  m.email.includes('@')

export default function NewsletterSendConfirmModal({
  token,
  newsletter,
  audienceCount,
  senderAddress,
  onClose,
  onSent,
}: {
  token: string
  newsletter: NewsletterDto
  /** Audience size resolved by the caller. Optional and nullable on purpose:
   *  the editor may pass a freshly fetched count, `newsletter.audienceCount`,
   *  or nothing at all when its fetch failed — see `resolvedAudience`. */
  audienceCount?: number | null
  /** The `From:` address members will see — pass `NewsletterDto.senderAddress`
   *  from a detail read. Falls back to `DEFAULT_SENDER` when absent. */
  senderAddress?: string | null
  onClose: () => void
  /** Called after a REAL dispatch (send or resend) — including a fully failed
   *  one, because the row now carries a new `lastSend` / history entry either
   *  way. Never called for a test send: nothing member-facing changed, and the
   *  editor's refetch would clobber unsaved edits. */
  onSent: (audit: SendAudit) => void
}) {
  const { language } = useLanguage()
  const t = useTranslations(language, 'dashboard')
  const copy = COPY[language] ?? COPY.fr

  const [mode, setMode] = useState<'test' | 'all'>('test')
  const [confirmed, setConfirmed] = useState(false)
  const [typed, setTyped] = useState('')
  const [testEmails, setTestEmails] = useState('')
  const [busy, setBusy] = useState<null | 'send' | 'resend'>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SendAudit | null>(null)
  /** Bumped on every landed receipt (send *and* resend) so the effect below
   *  re-runs and hands focus to the outcome region each time the body swaps. */
  const [receiptSeq, setReceiptSeq] = useState(0)
  /** Bumped when the admin dismisses a TEST receipt to go back to the options,
   *  so focus follows that body swap too instead of falling to <body>. */
  const [returnSeq, setReturnSeq] = useState(0)

  const [members, setMembers] = useState<MemberDto[] | null>(null)

  const outcomeRef = useRef<HTMLDivElement>(null)
  const testModeBtnRef = useRef<HTMLButtonElement>(null)

  /** AdminModal installs its focus trap / Escape handler / focus-restore in an
   *  effect keyed on `onClose`. The editor passes a fresh arrow function on every
   *  one of ITS renders — and it re-renders right after `onSent` refetches the
   *  newsletter — so a raw pass-through would tear that effect down and set it
   *  up again mid-receipt: the cleanup returns focus to whatever opened the
   *  dialog (the page behind it) and the re-run grabs the first focusable, i.e.
   *  it would undo the deliberate focus move below. Handing AdminModal a
   *  reference-stable callback that reads the latest prop from a ref keeps the
   *  trap, Escape and restore behaviour exactly as they are, and keeps them
   *  installed once. */
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  const stableClose = useCallback(() => onCloseRef.current(), [])

  const sender = (senderAddress ?? '').trim() || DEFAULT_SENDER
  const titleTarget = (newsletter.titleFr ?? '').trim()

  /** Only a published newsletter can go to the membership — the API answers 409
   *  `newsletter_not_published` otherwise, and it also refuses a second full
   *  send once the status has flipped to `sent`. A test send has no such
   *  precondition, which is the point: this dialog can be opened on a draft, and
   *  the test path is then the only one offered rather than the dialog being
   *  unreachable until after publication. */
  const canSendToAll = (newsletter.status ?? '').toLowerCase() === 'published'
  const titleMatches = useMemo(
    () => typed.trim().length > 0 && typed.trim() === titleTarget,
    [typed, titleTarget],
  )

  // Test intent is driven by the PARSED list, never by the raw string: `",,,;"`
  // is "something typed" but parses to nothing, and posting `{ testEmails: [] }`
  // used to dispatch a full member send under a test-send label.
  const testRecipients = useMemo(() => parseTestEmails(testEmails), [testEmails])
  const testEmailsInvalid = testEmails.trim().length > 0 && testRecipients.length === 0

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

  // The FR/EN split and the inspectable recipient list. The server's audience
  // count stays authoritative for the headline total; this fetch only splits it,
  // applying the same filter as NewsletterSender.IsEligibleRecipient. A failure
  // is silent: the breakdown and the list disappear, the total does not.
  useEffect(() => {
    let alive = true
    adminListMembers(token)
      .then((r) => {
        if (alive) setMembers(Array.isArray(r.members) ? r.members : null)
      })
      .catch(() => {
        if (alive) setMembers(null)
      })
    return () => {
      alive = false
    }
  }, [token])

  const audience = useMemo(() => {
    if (!members) return null
    const eligible = members.filter(isEligible)
    return {
      total: eligible.length,
      fr: eligible.filter((m) => m.preferredLanguage !== 'en'),
      en: eligible.filter((m) => m.preferredLanguage === 'en'),
    }
  }, [members])

  /** One line per subject that will actually be mailed. The sender groups
   *  recipients by `preferredLanguage` and uses `titleFr` / `titleEn` as the
   *  Subject header, so this is literally what lands in the inbox. Identical
   *  titles collapse to a single line; a language with nobody in it is dropped
   *  once the breakdown is known. */
  const subjectLines = useMemo(() => {
    const fr = titleTarget
    const en = (newsletter.titleEn ?? '').trim() || fr
    if (fr === en) return [{ lang: null as null | 'FR' | 'EN', subject: fr }]
    const lines: Array<{ lang: null | 'FR' | 'EN'; subject: string }> = []
    if (!audience || audience.fr.length > 0) lines.push({ lang: 'FR', subject: fr })
    if (!audience || audience.en.length > 0) lines.push({ lang: 'EN', subject: en })
    return lines
  }, [titleTarget, newsletter.titleEn, audience])

  const recipientSentence =
    resolvedAudience == null
      ? null
      : resolvedAudience === 1
        ? t.newsletterSendRecipientCountOne
        : t.newsletterSendRecipientCount.replace('{count}', String(resolvedAudience))

  const gatePassed = confirmed || titleMatches
  const sendDisabled =
    busy !== null ||
    (mode === 'test' ? testRecipients.length === 0 : !gatePassed || !canSendToAll)

  const landAudit = (raw: SendAudit) => {
    const audit = normalizeAudit(raw)
    setResult(audit)
    setReceiptSeq((n) => n + 1)
    // A real dispatch always rewrote LastSend + SendHistory server-side, even
    // when every message failed, so the parent must refetch either way. A test
    // send touched nothing member-facing.
    if (!audit.testMode) onSent(audit)
  }

  const handleSend = async () => {
    if (sendDisabled) return
    setBusy('send')
    setError(null)
    try {
      // `{}` — never `{ testEmails: [] }`. The API reads test intent off the
      // presence of the field, and an empty array is a 400 by design.
      const body = mode === 'test' ? { testEmails: testRecipients } : {}
      landAudit(await adminSendNewsletter(token, newsletter.id, body))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send newsletter')
    } finally {
      setBusy(null)
    }
  }

  const handleResendFailed = async () => {
    if (busy !== null) return
    setBusy('resend')
    setError(null)
    try {
      landAudit(await adminResendFailedNewsletter(token, newsletter.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend newsletter')
    } finally {
      setBusy(null)
    }
  }

  // Focus follows the body swap. Without this the focus stays on the primary
  // button that just unmounted, the browser resets it to <body>, and the admin
  // is dropped at the top of the page behind the dialog — with the receipt they
  // asked for unread. AdminModal's trap / Escape / focus-restore are untouched:
  // the outcome region is tabindex="-1", so it never joins the trap's list.
  useEffect(() => {
    if (receiptSeq > 0) outcomeRef.current?.focus()
  }, [receiptSeq])

  // The mirror image: leaving a test receipt swaps the body back to the options,
  // so focus is handed to the mode selector — the control the admin needs next to
  // choose the real send — rather than to the primary button, which must never
  // take a stray Enter.
  useEffect(() => {
    if (returnSeq > 0) testModeBtnRef.current?.focus()
  }, [returnSeq])

  /** Dismisses a TEST receipt without closing the dialog. Only ever reachable
   *  from a test receipt: nothing member-facing happened, so the send options —
   *  including the gates the admin may already have satisfied — are still valid.
   *  A real send is terminal here; its receipt is the end of the flow. */
  const backToOptions = () => {
    setResult(null)
    setError(null)
    setReturnSeq((n) => n + 1)
  }

  const outcome = result ? outcomeOf(result) : null
  const failedCount = result
    ? result.failedRecipientIds?.length || result.failedRecipients.length || result.failed
    : 0
  const canResend = !!result && !result.testMode && result.failed > 0 && failedCount > 0

  const headline = (() => {
    if (!result) return ''
    if (outcome === 'all_failed') return t.newsletterSendOutcomeAllFailed
    if (outcome === 'partial') {
      return t.newsletterSendOutcomePartial
        .replace('{sent}', String(result.sent))
        .replace('{failed}', String(result.failed))
    }
    // Only a CLEAN test send gets the neutral “test send complete” line: the
    // all-sent copy counts “members”, which a test send never reached, while a
    // test send that failed must say so rather than read as complete.
    if (result.testMode) return copy.testDone
    return t.newsletterSendOutcomeAllSent.replace('{count}', String(result.sent))
  })()

  const figureLabel = result
    ? t.newsletterRecipientsFigureLabel
        .replace('{sent}', String(result.sent))
        .replace('{total}', String(result.totalRecipients))
    : ''

  /** Both mode panels sit in the same grid cell, so the container keeps the
   *  height of the taller one and nothing reflows when the mode changes. */
  const layer = (visible: boolean) => ({
    gridArea: '1 / 1 / 2 / 2',
    visibility: visible ? ('visible' as const) : ('hidden' as const),
  })

  return (
    <AdminModal titleId="adm-send-newsletter" onClose={stableClose}>
      <div className="adash-modal-head">
        <div>
          <h2 id="adm-send-newsletter">{t.newsletterSendModalTitle}</h2>
          <p>{titleTarget || '(sans titre)'}</p>
        </div>
        <button
          type="button"
          className="adash-modal-close"
          onClick={onClose}
          aria-label={t.newsletterClose}
        >
          ×
        </button>
      </div>

      {result ? (
        <>
          {/* Calm by default: `.adash-panel` is the neutral console surface. The
              receipt used to borrow `.adash-creds`, the coral “copy this secret
              now” skin, so a clean delivery read as an alarm. `.adash-receipt`
              (+ is-ok / is-warn / is-bad) is the new hook for the severity tint
              — absent from admin.css it degrades to the neutral panel.

              Named by its own headline and focused, deliberately NOT a live
              region: the focus move is the announcement, and role="alert" here
              would dump the whole panel — up to a few hundred failed addresses
              — into a single assertive burst. */}
          <div
            ref={outcomeRef}
            tabIndex={-1}
            className={`adash-panel adash-receipt${
              outcome === 'all_failed' ? ' is-bad' : outcome === 'partial' ? ' is-warn' : ' is-ok'
            }`}
            role="group"
            aria-labelledby="adm-send-outcome-title"
          >
            <h3
              id="adm-send-outcome-title"
              style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 500 }}
            >
              {headline}
            </h3>

            <div className="adash-cred-row">
              <div>
                <span>{t.newsletterColRecipients}</span>
                <strong className="adash-mono" title={figureLabel} aria-label={figureLabel}>
                  {result.sent}/{result.totalRecipients}
                </strong>
              </div>
              {result.failed > 0 && (
                <div>
                  <span>{copy.failedLabel}</span>
                  <strong className="adash-mono">{result.failed}</strong>
                </div>
              )}
            </div>

            {result.failed > 0 && (
              <>
                <p className="adash-hint warn" style={{ margin: '12px 0 6px' }}>
                  {t.newsletterSendFailedListHint}
                </p>
                <ul
                  className="adash-mono"
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    maxHeight: 168,
                    overflowY: 'auto',
                    fontSize: 12.5,
                  }}
                >
                  {/* Index in the key: the audit is a log, not a set, so the
                      same address can legitimately appear twice. */}
                  {result.failedRecipients.map((addr, i) => (
                    <li key={`${i}:${addr}`}>{addr}</li>
                  ))}
                </ul>
                {result.errors.length > 0 && (
                  <ul className="adash-hint" style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                    {result.errors.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {error && (
            <p className="adash-error" role="alert">
              {error}
            </p>
          )}

          <div className="adash-detail-foot">
            {result.testMode && (
              // A test receipt is not a dead end: without this the only way on to
              // the real send was to close the dialog and reopen it, which is how
              // the safe path ended up feeling like the detour.
              <button
                type="button"
                className="adash-btn adash-btn-ghost"
                onClick={backToOptions}
                disabled={busy !== null}
              >
                {copy.backToOptions}
              </button>
            )}
            {canResend && (
              <button
                type="button"
                className="adash-btn adash-btn-ghost"
                onClick={handleResendFailed}
                disabled={busy !== null}
                aria-busy={busy === 'resend' || undefined}
              >
                {busy === 'resend'
                  ? copy.resending
                  : t.newsletterSendResendFailed.replace('{count}', String(failedCount))}
              </button>
            )}
            <button
              type="button"
              className="adash-btn adash-btn-primary"
              onClick={onClose}
              disabled={busy !== null}
              style={{ marginLeft: 'auto' }}
            >
              {t.newsletterClose}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* 1 — what is going out. Subject(s), sender, audience, FR/EN split,
              the recipient list itself, and the irreversibility warning. */}
          <div className="adash-panel adash-send-summary">
            {subjectLines.map((line) => (
              <p key={`${line.lang ?? 'all'}:${line.subject}`} style={{ margin: '0 0 8px' }}>
                {/* `is-draft` is borrowed on purpose: it is the one pill variant
                    that is neutral grey rather than a status colour, which is
                    what a language badge should be. */}
                {line.lang && (
                  <span className="adash-pill is-draft" style={{ marginRight: 8 }}>
                    {line.lang}
                  </span>
                )}
                {t.newsletterSendSummary
                  .replace('{subject}', line.subject || '—')
                  .replace('{sender}', sender)}
              </p>
            ))}

            <p style={{ margin: '0 0 10px' }}>
              {/* No "counting recipients…" branch here on purpose: the caller
                  disables its send affordance while the count is unresolved, so
                  this dialog cannot mount mid-count. An unresolved audience at
                  this point means the count genuinely failed. */}
              {recipientSentence ?? (
                <em className="adash-hint warn">{t.newsletterAudienceUnknown}</em>
              )}
            </p>

            {audience && (
              <>
                <div
                  className="adash-cred-row"
                  role="group"
                  aria-label={copy.breakdownLabel}
                  style={{ marginBottom: 10 }}
                >
                  <div>
                    <span>FR</span>
                    <strong className="adash-mono">{audience.fr.length}</strong>
                  </div>
                  <div>
                    <span>EN</span>
                    <strong className="adash-mono">{audience.en.length}</strong>
                  </div>
                </div>

                <details style={{ marginBottom: 10 }}>
                  <summary className="adash-hint">
                    {t.newsletterColRecipients} ({audience.total})
                  </summary>
                  <ul
                    className="adash-mono"
                    style={{
                      margin: '8px 0 0',
                      paddingLeft: 18,
                      maxHeight: 168,
                      overflowY: 'auto',
                      fontSize: 12.5,
                    }}
                  >
                    {[...audience.fr, ...audience.en]
                      .slice()
                      .sort((a, b) => a.email.localeCompare(b.email))
                      .map((m) => (
                        <li key={m.id}>
                          {m.preferredLanguage === 'en' ? 'EN' : 'FR'} · {m.email}
                        </li>
                      ))}
                  </ul>
                </details>
              </>
            )}

            <p className="adash-hint warn" style={{ margin: 0 }}>
              {t.newsletterSendIrreversible}
            </p>
          </div>

          {/* 2 — how to send. The safe option is first and selected by default;
              the irreversible one is the deliberate second click, and is offered
              at all only when the API would accept it. */}
          {!canSendToAll && (
            <p className="adash-hint warn" style={{ margin: 0 }} id="adm-send-all-blocked">
              {t.newsletterSendNeedsPublish}
            </p>
          )}
          <div className="adash-seg" role="group" aria-label={t.newsletterSendModalTitle}>
            <button
              ref={testModeBtnRef}
              type="button"
              className={mode === 'test' ? 'is-active' : undefined}
              aria-pressed={mode === 'test'}
              onClick={() => setMode('test')}
              disabled={busy !== null}
            >
              {t.newsletterSendTestLabel}
            </button>
            <button
              type="button"
              className={mode === 'all' ? 'is-active' : undefined}
              aria-pressed={mode === 'all'}
              onClick={() => setMode('all')}
              disabled={busy !== null || !canSendToAll}
              aria-describedby={canSendToAll ? undefined : 'adm-send-all-blocked'}
            >
              {t.newsletterSendAllAction}
            </button>
          </div>

          {/* 3 — the panels. Stacked in one grid cell: the container is as tall
              as the taller panel, so switching modes reflows nothing. The hidden
              layer's controls are disabled, which is also what keeps them out of
              AdminModal's focus trap. */}
          <div style={{ display: 'grid', alignItems: 'start' }}>
            <div style={layer(mode === 'test')} aria-hidden={mode !== 'test'}>
              <div className="adash-form-grid">
                <div className="adash-field full">
                  <label htmlFor="adm-send-test-emails">{t.newsletterSendTestLabel}</label>
                  <textarea
                    id="adm-send-test-emails"
                    className="adash-input adash-textarea"
                    rows={2}
                    value={testEmails}
                    onChange={(e) => setTestEmails(e.target.value)}
                    placeholder="editorial@pavillon46.ch, direction@pavillon46.ch"
                    aria-invalid={testEmailsInvalid || undefined}
                    aria-describedby="adm-send-test-hint"
                    disabled={mode !== 'test' || busy !== null}
                  />
                  <span
                    id="adm-send-test-hint"
                    className={testEmailsInvalid ? 'adash-hint warn' : 'adash-hint'}
                  >
                    {testEmailsInvalid
                      ? t.newsletterTestEmailsInvalid
                      : t.newsletterSendTestHint}
                  </span>
                </div>
              </div>
            </div>

            <div style={layer(mode === 'all')} aria-hidden={mode !== 'all'}>
              <div className="adash-form-grid">
                <div className="adash-field full">
                  <label className="adash-check" htmlFor="adm-send-confirm">
                    <input
                      id="adm-send-confirm"
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      disabled={mode !== 'all' || busy !== null}
                    />
                    <span>{copy.confirmCheckbox}</span>
                  </label>
                </div>
                <div className="adash-field full">
                  <label htmlFor="adm-send-typed">
                    {t.newsletterSendTypedConfirm.replace('{title}', titleTarget)}
                  </label>
                  <input
                    id="adm-send-typed"
                    className="adash-input"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={titleTarget}
                    aria-describedby="adm-send-typed-hint"
                    aria-invalid={(typed.length > 0 && !titleMatches) || undefined}
                    disabled={mode !== 'all' || busy !== null}
                  />
                  {/* Rendered even when empty (non-breaking space) so the line is
                      already reserved and the mismatch warning cannot push the
                      footer button up under the pointer. */}
                  <span id="adm-send-typed-hint" className="adash-hint warn">
                    {typed.length > 0 && !titleMatches ? copy.titleMismatch : ' '}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <p className="adash-error" role="alert">
              {error}
            </p>
          )}

          <div className="adash-detail-foot">
            <button
              type="button"
              className="adash-btn adash-btn-ghost"
              onClick={onClose}
              disabled={busy !== null}
            >
              {t.newsletterCancel}
            </button>
            <button
              type="button"
              className={`adash-btn ${mode === 'all' ? 'adash-btn-danger' : 'adash-btn-primary'}`}
              onClick={handleSend}
              disabled={sendDisabled}
              aria-busy={busy === 'send' || undefined}
              style={{ marginLeft: 'auto' }}
            >
              {busy === 'send'
                ? copy.sending
                : mode === 'test'
                  ? t.newsletterSendTestAction.replace('{count}', String(testRecipients.length))
                  : t.newsletterSendAllAction}
            </button>
          </div>
        </>
      )}
    </AdminModal>
  )
}
