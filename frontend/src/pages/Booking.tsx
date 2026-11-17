import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations, type BookingTranslations, type Language } from '../lib/translations'
import { IMAGE_PATHS } from '../lib/constants'
import { EASE_SMOOTH_OUT } from '../lib/motion'
import {
  ApiError,
  bookMeeting,
  getMeetingAvailability,
  getMeetingInvite,
  type MeetingAvailabilityDay,
  type MeetingBookingResponse,
} from '../lib/api'
import {
  addDays,
  addMinutes,
  addMonths,
  buildIcs,
  capitalise,
  firstOfMonth,
  formatLongDate,
  formatMonth,
  groupSlots,
  isoWeekday,
  lastOfMonth,
  monthGrid,
  weekdayNames,
  yearMonthOf,
  type IsoDate,
  type YearMonth,
} from '../lib/booking'

/** The French and English addresses of this page. */
const PATHS: Record<Language, string> = { fr: '/rendez-vous', en: '/en/meeting' }
const CONTACT_EMAIL = 'info@pavillon46.ch'
// One availability call covers this many days (the API allows 92).
const WINDOW_DAYS = 92

type Stage = 'pick' | 'details' | 'done'
type Field = 'firstName' | 'lastName' | 'email' | 'phone' | 'message'
type ErrorKey = 'errFirstName' | 'errLastName' | 'errEmail' | 'errPhone' | 'errMessage'
type BannerKey = 'errTaken' | 'errRateLimited' | 'errGeneric'

interface InviteState {
  status: 'none' | 'checking' | 'valid' | 'invalid'
  firstName: string
  lastName: string
  email: string
  code: string
}

const EMAIL_RE = /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]{2,}$/
const PHONE_RE = /^\+?[0-9 ().\-/]+$/

function validate(form: Record<Field, string>): Partial<Record<Field, ErrorKey>> {
  const errors: Partial<Record<Field, ErrorKey>> = {}
  if (!form.firstName.trim() || form.firstName.trim().length > 80) errors.firstName = 'errFirstName'
  if (!form.lastName.trim() || form.lastName.trim().length > 80) errors.lastName = 'errLastName'
  if (!EMAIL_RE.test(form.email.trim())) errors.email = 'errEmail'
  const phone = form.phone.trim()
  const digits = phone.replace(/\D/g, '').length
  if (!PHONE_RE.test(phone) || digits < 6 || digits > 20 || phone.length > 32) errors.phone = 'errPhone'
  if (form.message.trim().length > 1000) errors.message = 'errMessage'
  return errors
}

/** Today in Zurich, whatever the visitor's own clock. */
function zurichToday(): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date())
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), template)
}

function availableLabel(t: BookingTranslations, count: number): string {
  return count === 1 ? t.dayAvailableOne : fill(t.dayAvailable, { count })
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function Booking({ lang }: { lang: Language }) {
  const { language, changeLanguage } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const inviteToken = (searchParams.get('invite') ?? '').trim()

  // The address decides the language: /rendez-vous is French, /en/meeting
  // English — also over a language remembered from an earlier visit, which
  // LanguageProvider restores after this page mounts.
  useEffect(() => {
    if (language !== lang) changeLanguage(lang)
  }, [lang, language, changeLanguage])

  const t = useTranslations(lang, 'booking')
  const tHome = useTranslations(lang, 'home')
  const tCommon = useTranslations(lang, 'common')

  useEffect(() => {
    document.title = t.title
  }, [t.title])

  const switchLanguage = (next: Language) => {
    if (next === lang) return
    changeLanguage(next)
    navigate({ pathname: PATHS[next], search: location.search }, { replace: true })
  }

  // ---- availability ------------------------------------------------------
  const [days, setDays] = useState<Record<IsoDate, MeetingAvailabilityDay>>({})
  const [loadedTo, setLoadedTo] = useState<IsoDate | null>(null)
  const [meta, setMeta] = useState<{ today: IsoDate; lastDate: IsoDate; slotMinutes: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [viewMonth, setViewMonth] = useState<YearMonth>(() => yearMonthOf(zurichToday()))
  const requestId = useRef(0)

  const load = useCallback(async (from: IsoDate, to: IsoDate, replace: boolean) => {
    const id = ++requestId.current
    setLoading(true)
    setLoadError(false)
    try {
      const data = await getMeetingAvailability(from, to)
      if (id !== requestId.current) return null
      setMeta({ today: data.today, lastDate: data.lastDate, slotMinutes: data.slotMinutes })
      setDays((prev) => {
        const next = replace ? {} : { ...prev }
        for (const d of data.days) next[d.date] = d
        return next
      })
      setLoadedTo((prev) => (replace || !prev || to > prev ? to : prev))
      return data
    } catch {
      if (id === requestId.current) setLoadError(true)
      return null
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  const loadInitial = useCallback(async () => {
    const from = zurichToday()
    const data = await load(from, addDays(from, WINDOW_DAYS - 1), true)
    if (!data) return
    // Open on the month of the first free day, not on an empty month.
    const first = data.days.find((d) => d.status === 'open')
    if (first) setViewMonth(yearMonthOf(first.date))
  }, [load])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  const minMonth = yearMonthOf(meta?.today ?? zurichToday())
  const maxMonth = meta ? yearMonthOf(meta.lastDate) : addMonths(minMonth, 2)

  // A horizon longer than one window: fetch a month when it comes into view.
  useEffect(() => {
    if (!loadedTo || !meta || loading) return
    const last = lastOfMonth(viewMonth)
    if (last > loadedTo && firstOfMonth(viewMonth) <= meta.lastDate) {
      const from = addDays(loadedTo, 1)
      void load(from, addDays(from, WINDOW_DAYS - 1) < last ? addDays(from, WINDOW_DAYS - 1) : last, false)
    }
  }, [viewMonth, loadedTo, meta, loading, load])

  const firstOpen = useMemo(
    () => Object.values(days).filter((d) => d.status === 'open').sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
    [days],
  )

  // ---- invitation ----------------------------------------------------------
  const [invite, setInvite] = useState<InviteState>({
    status: inviteToken ? 'checking' : 'none', firstName: '', lastName: '', email: '', code: '',
  })

  // ---- selection and form -------------------------------------------------
  const [stage, setStage] = useState<Stage>('pick')
  const [selectedDate, setSelectedDate] = useState<IsoDate | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [form, setForm] = useState<Record<Field, string>>({ firstName: '', lastName: '', email: '', phone: '', message: '' })
  const [errors, setErrors] = useState<Partial<Record<Field, ErrorKey>>>({})
  const [banner, setBanner] = useState<BannerKey | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [booked, setBooked] = useState<MeetingBookingResponse | null>(null)

  useEffect(() => {
    if (!inviteToken) {
      setInvite({ status: 'none', firstName: '', lastName: '', email: '', code: '' })
      return
    }
    let active = true
    setInvite((prev) => ({ ...prev, status: 'checking' }))
    getMeetingInvite(inviteToken)
      .then((res) => {
        if (!active) return
        if (!res.valid) {
          setInvite({ status: 'invalid', firstName: '', lastName: '', email: '', code: '' })
          return
        }
        const next = {
          status: 'valid' as const,
          firstName: res.firstName ?? '',
          lastName: res.lastName ?? '',
          email: res.email ?? '',
          code: res.code ?? '',
        }
        setInvite(next)
        setForm((prev) => ({
          ...prev,
          firstName: next.firstName || prev.firstName,
          lastName: next.lastName || prev.lastName,
          email: next.email || prev.email,
        }))
      })
      .catch(() => {
        // Unreachable: book as a direct visitor rather than block the page.
        if (active) setInvite({ status: 'invalid', firstName: '', lastName: '', email: '', code: '' })
      })
    return () => {
      active = false
    }
  }, [inviteToken])

  const locked: Partial<Record<Field, boolean>> = invite.status === 'valid'
    ? { firstName: !!invite.firstName, lastName: !!invite.lastName, email: !!invite.email }
    : {}

  const slotMinutes = meta?.slotMinutes ?? 45
  const selectedDay = selectedDate ? days[selectedDate] : undefined

  // ---- focus and scrolling between steps -----------------------------------
  const slotsRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const fieldRefs = useRef<Partial<Record<Field, HTMLInputElement | HTMLTextAreaElement | null>>>({})
  const focusStageHeading = useRef(false)

  // Each step's heading takes focus when the step arrives (AnimatePresence
  // mounts it once the previous step has left), so keyboard and screen-reader
  // users land on the new step instead of on a button that just vanished.
  const stageHeadingRef = useCallback((el: HTMLHeadingElement | null) => {
    if (!el || !focusStageHeading.current) return
    focusStageHeading.current = false
    el.focus({ preventScroll: true })
    panelRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }, [])

  const goToStage = (next: Stage) => {
    focusStageHeading.current = true
    setStage(next)
  }

  const chooseDate = (date: IsoDate) => {
    setSelectedDate(date)
    setSelectedTime(null)
    setBanner(null)
    // Stacked layout (see booking.css): bring the times into view.
    if (window.matchMedia('(max-width: 767px), (min-width: 1024px) and (max-width: 1199px)').matches) {
      window.setTimeout(() => {
        slotsRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
      }, 30)
    }
  }

  const chooseTime = (time: string) => {
    setSelectedTime(time)
    setBanner(null)
    goToStage('details')
  }

  const jumpToFirstOpen = () => {
    if (!firstOpen) return
    setViewMonth(yearMonthOf(firstOpen.date))
    chooseDate(firstOpen.date)
  }

  const updateField = (field: Field, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedDate || !selectedTime || submitting) return
    const found = validate(form)
    setErrors(found)
    const firstInvalid = (['firstName', 'lastName', 'email', 'phone', 'message'] as Field[]).find((f) => found[f])
    if (firstInvalid) {
      fieldRefs.current[firstInvalid]?.focus()
      return
    }
    setSubmitting(true)
    setBanner(null)
    try {
      const res = await bookMeeting({
        date: selectedDate,
        time: selectedTime,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        message: form.message.trim(),
        language: lang,
        invite: invite.status === 'valid' ? inviteToken : undefined,
      })
      setBooked(res)
      goToStage('done')
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Someone else was quicker: back to the times, with fresh availability.
        setBanner('errTaken')
        setSelectedTime(null)
        goToStage('pick')
        const from = zurichToday()
        void load(from, addDays(from, WINDOW_DAYS - 1), true)
      } else if (err instanceof ApiError && err.status === 429) {
        setBanner('errRateLimited')
      } else {
        // 400s are caught by the checks above before they reach the server.
        setBanner('errGeneric')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const downloadIcs = () => {
    if (!booked) return
    const ics = buildIcs({
      uid: `${booked.id}@pavillon46.ch`,
      startsAt: booked.startsAt,
      durationMinutes: booked.durationMinutes,
      title: t.icsTitle,
      location: t.placeValue,
      description: t.icsDescription,
    })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = lang === 'fr' ? 'pavillon46-rendez-vous.ics' : 'pavillon46-meeting.ics'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const step = stage === 'details' ? 3 : stage === 'done' ? 4 : selectedDate ? 2 : 1
  const greetingName = invite.status === 'valid' ? invite.firstName : ''

  return (
    <div className="book-page">
      <motion.aside
        className="book-visual"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9, ease: EASE_SMOOTH_OUT }}
      >
        <div className="book-visual-media" aria-hidden="true" />
        <div className="book-visual-veil" aria-hidden="true" />
        <div className="book-visual-inner">
          <div className="book-visual-top">
            <Link to="/" className="book-logo" aria-label="Pavillon 46">
              <img src={IMAGE_PATHS.logo} alt="" />
            </Link>
            <div className="book-lang" role="group" aria-label={lang === 'fr' ? 'Langue' : 'Language'}>
              <button type="button" className={lang === 'fr' ? 'is-active' : ''} aria-pressed={lang === 'fr'} aria-label="Français" lang="fr" onClick={() => switchLanguage('fr')}>
                FR
              </button>
              <span aria-hidden="true">|</span>
              <button type="button" className={lang === 'en' ? 'is-active' : ''} aria-pressed={lang === 'en'} aria-label="English" lang="en" onClick={() => switchLanguage('en')}>
                EN
              </button>
            </div>
          </div>

          <div className="book-visual-center">
            <span className="book-eyebrow">{t.eyebrow}</span>
            <h1 className="book-title">
              {t.headingStart} <span className="book-title-accent">{t.headingAccent}</span>
            </h1>
            <p className="book-lede">
              {greetingName ? fill(t.inviteGreeting, { name: greetingName }) : t.lede}
            </p>
            <dl className="book-facts">
              <div className="book-fact">
                <dt>{t.durationLabel}</dt>
                <dd>{fill(t.durationValue, { minutes: slotMinutes })}</dd>
              </div>
              <div className="book-fact">
                <dt>{t.placeLabel}</dt>
                <dd>{t.placeValue}</dd>
              </div>
              {invite.status === 'valid' && invite.code && (
                <div className="book-fact">
                  <dt>{t.codeLabel}</dt>
                  <dd><span className="book-code">{invite.code}</span></dd>
                </div>
              )}
            </dl>
          </div>

          <div className="book-visual-foot">
            <span>{tHome.openingDate}</span>
            <span className="book-visual-links">
              <Link to="/legal">{tCommon.legal}</Link>
              <span aria-hidden="true">·</span>
              <Link to="/privacy">{tCommon.privacy}</Link>
            </span>
          </div>
        </div>
      </motion.aside>

      <main className="book-panel" ref={panelRef}>
        {stage !== 'done' && <Steps t={t} step={step} />}

        {invite.status === 'invalid' && stage !== 'done' && (
          <p className="book-notice" role="status">{t.inviteInvalid}</p>
        )}
        {banner && (
          <p className="book-banner" role="alert">
            {t[banner]}
          </p>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {stage === 'pick' && (
            <motion.section
              key="pick"
              className="book-stage book-pick"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: EASE_SMOOTH_OUT }}
              aria-labelledby="book-pick-heading"
            >
              <h2 id="book-pick-heading" className="book-sr-only" ref={stageHeadingRef} tabIndex={-1}>
                {t.chooseDay}
              </h2>
              <div className="book-pick-grid">
                <div className="book-card book-cal-card">
                  <p className="book-card-kicker" aria-hidden="true">{t.chooseDay}</p>
                  {loadError && Object.keys(days).length === 0 ? (
                    <div className="book-empty" role="alert">
                      <p>{t.loadError}</p>
                      <button type="button" className="book-btn book-btn-ghost" onClick={() => void loadInitial()}>
                        {t.retry}
                      </button>
                    </div>
                  ) : loading && Object.keys(days).length === 0 ? (
                    <CalendarSkeleton label={t.loading} />
                  ) : (
                    <Calendar
                      t={t}
                      lang={lang}
                      month={viewMonth}
                      minMonth={minMonth}
                      maxMonth={maxMonth}
                      days={days}
                      today={meta?.today ?? zurichToday()}
                      selected={selectedDate}
                      onMonth={setViewMonth}
                      onSelect={chooseDate}
                    />
                  )}
                </div>

                <div className="book-card book-slots-card" ref={slotsRef}>
                  <p className="book-card-kicker">{t.chooseTime}</p>
                  <p className="book-sr-only" aria-live="polite">
                    {selectedDate && selectedDay
                      ? `${capitalise(formatLongDate(selectedDate, lang))}: ${selectedDay.slots.length > 0
                        ? availableLabel(t, selectedDay.slots.length)
                        : t.noSlots}`
                      : ''}
                  </p>
                  {selectedDate && selectedDay ? (
                    <>
                      <h3 className="book-slots-date">{capitalise(formatLongDate(selectedDate, lang))}</h3>
                      <p className="book-slots-tz">{t.timeZoneNote} · {fill(t.durationValue, { minutes: slotMinutes })}</p>
                      {selectedDay.slots.length === 0 ? (
                        <p className="book-muted">{t.noSlots}</p>
                      ) : (
                        <SlotGroups t={t} slots={selectedDay.slots} selected={selectedTime} onSelect={chooseTime} />
                      )}
                    </>
                  ) : loading && Object.keys(days).length === 0 ? (
                    <SlotsSkeleton />
                  ) : !loadError && !firstOpen && !loading ? (
                    <p className="book-muted">
                      {t.noAvailability.split(CONTACT_EMAIL)[0]}
                      <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                      {t.noAvailability.split(CONTACT_EMAIL)[1] ?? ''}
                    </p>
                  ) : (
                    <div className="book-slots-empty">
                      <span className="book-slots-empty-mark" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none">
                          <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </span>
                      <p className="book-muted">{t.chooseDayFirst}</p>
                      {firstOpen && (
                        <button type="button" className="book-btn book-btn-soft book-next" onClick={jumpToFirstOpen}>
                          <span className="book-next-label">{t.nextAvailable}</span>
                          <span className="book-next-date">{capitalise(formatLongDate(firstOpen.date, lang))}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.section>
          )}

          {stage === 'details' && selectedDate && selectedTime && (
            <motion.section
              key="details"
              className="book-stage"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: EASE_SMOOTH_OUT }}
              aria-labelledby="book-details-heading"
            >
              <div className="book-card book-details-card">
                <div className="book-summary">
                  <div>
                    <p className="book-card-kicker">{t.selectedSlot}</p>
                    <p className="book-summary-date">{capitalise(formatLongDate(selectedDate, lang, true))}</p>
                    <p className="book-summary-time">
                      {selectedTime} – {addMinutes(selectedTime, slotMinutes)} · {t.timeZoneNote}
                    </p>
                  </div>
                  <button type="button" className="book-btn book-btn-ghost book-btn-sm" onClick={() => goToStage('pick')}>
                    {t.change}
                  </button>
                </div>

                <h2 id="book-details-heading" className="book-form-title" ref={stageHeadingRef} tabIndex={-1}>
                  {t.yourDetails}
                </h2>

                <form className="book-form" onSubmit={submit} noValidate>
                  <div className="book-form-row">
                    <TextField
                      id="book-first" label={t.firstName} value={form.firstName} autoComplete="given-name"
                      locked={locked.firstName} lockedHint={t.lockedHint} error={errors.firstName && t[errors.firstName]}
                      inputRef={(el) => { fieldRefs.current.firstName = el }}
                      onChange={(v) => updateField('firstName', v)}
                    />
                    <TextField
                      id="book-last" label={t.lastName} value={form.lastName} autoComplete="family-name"
                      locked={locked.lastName} lockedHint={t.lockedHint} error={errors.lastName && t[errors.lastName]}
                      inputRef={(el) => { fieldRefs.current.lastName = el }}
                      onChange={(v) => updateField('lastName', v)}
                    />
                  </div>
                  <TextField
                    id="book-email" label={t.email} value={form.email} type="email" autoComplete="email" inputMode="email"
                    locked={locked.email} lockedHint={t.lockedHint} error={errors.email && t[errors.email]}
                    inputRef={(el) => { fieldRefs.current.email = el }}
                    onChange={(v) => updateField('email', v)}
                  />
                  <TextField
                    id="book-phone" label={t.phone} value={form.phone} type="tel" autoComplete="tel" inputMode="tel"
                    hint={t.phoneHint} error={errors.phone && t[errors.phone]}
                    inputRef={(el) => { fieldRefs.current.phone = el }}
                    onChange={(v) => updateField('phone', v)}
                  />
                  <div className="book-field">
                    <label htmlFor="book-message" className="book-label">
                      {t.message} <span className="book-optional">({t.optional})</span>
                    </label>
                    <textarea
                      id="book-message"
                      ref={(el) => { fieldRefs.current.message = el }}
                      className={`book-input book-textarea${errors.message ? ' is-invalid' : ''}`}
                      value={form.message}
                      rows={3}
                      maxLength={1200}
                      placeholder={t.messagePlaceholder}
                      aria-invalid={!!errors.message}
                      aria-describedby={errors.message ? 'book-message-error' : undefined}
                      onChange={(e) => updateField('message', e.target.value)}
                    />
                    {errors.message && (
                      <span id="book-message-error" className="book-error" role="alert">{t[errors.message]}</span>
                    )}
                  </div>

                  <button type="submit" className="book-btn book-btn-primary book-submit" disabled={submitting} aria-busy={submitting}>
                    {submitting && <span className="book-spinner" aria-hidden="true" />}
                    {submitting ? t.confirming : t.confirm}
                  </button>
                </form>
              </div>
            </motion.section>
          )}

          {stage === 'done' && booked && (
            <motion.section
              key="done"
              className="book-stage"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE_SMOOTH_OUT }}
              aria-labelledby="book-done-heading"
            >
              <div className="book-card book-done">
                <motion.span
                  className="book-done-mark"
                  aria-hidden="true"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.15, ease: EASE_SMOOTH_OUT }}
                >
                  <svg viewBox="0 0 48 48" fill="none">
                    <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" />
                    <motion.path
                      d="M15 24.5l6.2 6.2L33.5 18"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.6, delay: 0.45, ease: EASE_SMOOTH_OUT }}
                    />
                  </svg>
                </motion.span>
                <p className="book-eyebrow book-eyebrow-dark">{t.doneEyebrow}</p>
                <h2 id="book-done-heading" className="book-done-title" ref={stageHeadingRef} tabIndex={-1}>
                  {form.firstName.trim() ? fill(t.doneHeading, { name: form.firstName.trim() }) : t.doneHeadingNoName}
                </h2>
                <p className="book-done-body">{fill(t.doneBody, { email: form.email.trim() })}</p>

                <dl className="book-done-list">
                  <div>
                    <dt>{t.stepDay}</dt>
                    <dd>{capitalise(formatLongDate(booked.date, lang, true))}</dd>
                  </div>
                  <div>
                    <dt>{t.stepTime}</dt>
                    <dd>{booked.time} – {addMinutes(booked.time, booked.durationMinutes)} · {t.timeZoneNote}</dd>
                  </div>
                  <div>
                    <dt>{t.placeLabel}</dt>
                    <dd>{t.placeValue}</dd>
                  </div>
                  {invite.status === 'valid' && invite.code && (
                    <div>
                      <dt>{t.codeLabel}</dt>
                      <dd><span className="book-code book-code-dark">{invite.code}</span></dd>
                    </div>
                  )}
                </dl>

                <div className="book-done-actions">
                  <button type="button" className="book-btn book-btn-primary" onClick={downloadIcs}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="book-btn-ico">
                      <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M3.5 9.5h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    {t.addToCalendar}
                  </button>
                  <Link to="/" className="book-btn book-btn-ghost">{t.backHome}</Link>
                </div>
                <p className="book-done-contact">
                  {t.contactLine} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                </p>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <footer className="book-panel-foot">
          <span>{tHome.openingDate}</span>
          <span className="book-visual-links">
            <Link to="/legal">{tCommon.legal}</Link>
            <span aria-hidden="true">·</span>
            <Link to="/privacy">{tCommon.privacy}</Link>
          </span>
        </footer>
      </main>
    </div>
  )
}

function Steps({ t, step }: { t: BookingTranslations; step: number }) {
  const labels = [t.stepDay, t.stepTime, t.stepDetails]
  return (
    <ol className="book-steps" aria-label={t.stepsLabel}>
      {labels.map((label, i) => {
        const n = i + 1
        const state = n < step ? 'is-done' : n === step ? 'is-current' : ''
        return (
          <li key={label} className={`book-step ${state}`} aria-current={n === step ? 'step' : undefined}>
            <span className="book-step-dot" aria-hidden="true">
              {n < step ? (
                <svg viewBox="0 0 16 16" fill="none"><path d="M4 8.5l2.5 2.5L12 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : n}
            </span>
            <span className="book-step-label">{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Calendar({
  t, lang, month, minMonth, maxMonth, days, today, selected, onMonth, onSelect,
}: {
  t: BookingTranslations
  lang: Language
  month: YearMonth
  minMonth: YearMonth
  maxMonth: YearMonth
  days: Record<IsoDate, MeetingAvailabilityDay>
  today: IsoDate
  selected: IsoDate | null
  onMonth: (m: YearMonth) => void
  onSelect: (d: IsoDate) => void
}) {
  const headingId = useId()
  const helpId = useId()
  const weeks = useMemo(() => monthGrid(month), [month])
  const names = useMemo(() => weekdayNames(lang, 'short'), [lang])
  const longNames = useMemo(() => weekdayNames(lang, 'long'), [lang])
  const buttons = useRef<Record<IsoDate, HTMLButtonElement | null>>({})
  const keyboardMove = useRef(false)

  // Roving focus: one day in the month takes Tab; arrows move it.
  const defaultFocus = useMemo(() => {
    if (selected && yearMonthOf(selected) === month) return selected
    const open = weeks.flat().find((d) => d && days[d]?.status === 'open')
    if (open) return open
    if (yearMonthOf(today) === month) return today
    return firstOfMonth(month)
  }, [selected, month, weeks, days, today])
  const [focused, setFocused] = useState<IsoDate>(defaultFocus)
  useEffect(() => {
    if (yearMonthOf(focused) !== month) setFocused(defaultFocus)
  }, [month, focused, defaultFocus])

  useEffect(() => {
    if (!keyboardMove.current) return
    keyboardMove.current = false
    buttons.current[focused]?.focus()
  }, [focused, month])

  const canPrev = month > minMonth
  const canNext = month < maxMonth

  const moveTo = (date: IsoDate) => {
    const ym = yearMonthOf(date)
    if (ym < minMonth || ym > maxMonth) return
    keyboardMove.current = true
    if (ym !== month) onMonth(ym)
    setFocused(date)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    const moves: Record<string, () => IsoDate> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, 1 - isoWeekday(focused)),
      End: () => addDays(focused, 7 - isoWeekday(focused)),
      PageUp: () => clampDay(addMonths(month, -1), focused),
      PageDown: () => clampDay(addMonths(month, 1), focused),
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    moveTo(move())
  }

  return (
    <div className="book-cal">
      <div className="book-cal-head">
        <button type="button" className="book-cal-nav" onClick={() => onMonth(addMonths(month, -1))} disabled={!canPrev} aria-label={t.prevMonth}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h3 id={headingId} className="book-cal-month" aria-live="polite">{capitalise(formatMonth(month, lang))}</h3>
        <button type="button" className="book-cal-nav" onClick={() => onMonth(addMonths(month, 1))} disabled={!canNext} aria-label={t.nextMonth}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9.5 6l6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <p id={helpId} className="book-sr-only">{t.calendarHelp}</p>
      <table className="book-cal-grid" aria-labelledby={headingId} aria-describedby={helpId} onKeyDown={onKeyDown}>
        <thead>
          <tr>
            {names.map((n, i) => (
              <th key={n} scope="col" abbr={longNames[i]}>{n.replace('.', '')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((date, di) => {
                if (!date) return <td key={`pad-${wi}-${di}`} className="book-cal-pad" />
                const info = days[date]
                const status = date < today ? 'closed' : info?.status ?? 'closed'
                const isSelected = date === selected
                const isToday = date === today
                const label = [
                  capitalise(formatLongDate(date, lang)),
                  isToday ? t.today : null,
                  status === 'open'
                    ? availableLabel(t, info?.slots.length ?? 0)
                    : status === 'full' ? t.dayFull : t.dayClosed,
                ].filter(Boolean).join(', ')
                return (
                  <td key={date}>
                    <button
                      type="button"
                      ref={(el) => { buttons.current[date] = el }}
                      className={`book-day is-${status}${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                      tabIndex={date === focused ? 0 : -1}
                      aria-label={label}
                      aria-pressed={isSelected}
                      aria-disabled={status !== 'open'}
                      onFocus={() => setFocused(date)}
                      onClick={() => status === 'open' && onSelect(date)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && status !== 'open') e.preventDefault()
                      }}
                    >
                      <span className="book-day-num">{Number(date.slice(8))}</span>
                      {status === 'open' && <span className="book-day-dot" />}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="book-legend" aria-hidden="true">
        <li><span className="book-legend-swatch is-open" />{t.legendAvailable}</li>
        <li><span className="book-legend-swatch is-full" />{t.legendFull}</li>
        <li><span className="book-legend-swatch is-closed" />{t.legendClosed}</li>
      </ul>
    </div>
  )
}

/** The same day of the month in another month, or its last day. */
function clampDay(ym: YearMonth, from: IsoDate): IsoDate {
  const last = lastOfMonth(ym)
  const day = `${ym}-${from.slice(8)}`
  return day > last ? last : day
}

function SlotGroups({
  t, slots, selected, onSelect,
}: {
  t: BookingTranslations
  slots: string[]
  selected: string | null
  onSelect: (time: string) => void
}) {
  const { morning, afternoon } = groupSlots(slots)
  const group = (label: string, list: string[]) => list.length > 0 && (
    <div className="book-slot-group" role="group" aria-label={label}>
      <p className="book-slot-group-label" aria-hidden="true">{label}</p>
      <div className="book-slot-grid">
        {list.map((time) => (
          <button
            key={time}
            type="button"
            className={`book-slot${selected === time ? ' is-selected' : ''}`}
            aria-pressed={selected === time}
            onClick={() => onSelect(time)}
          >
            {time}
          </button>
        ))}
      </div>
    </div>
  )
  return (
    <div className="book-slot-groups">
      {group(t.morning, morning)}
      {group(t.afternoon, afternoon)}
    </div>
  )
}

function TextField({
  id, label, value, onChange, type = 'text', autoComplete, inputMode, hint, error, locked, lockedHint, inputRef,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
  inputMode?: 'email' | 'tel' | 'text'
  hint?: string
  error?: string | false
  locked?: boolean
  lockedHint?: string
  inputRef?: (el: HTMLInputElement | null) => void
}) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null, locked ? `${id}-locked` : null]
    .filter(Boolean).join(' ') || undefined
  return (
    <div className="book-field">
      <label htmlFor={id} className="book-label">{label}</label>
      <div className={`book-input-wrap${locked ? ' is-locked' : ''}`}>
        <input
          id={id}
          ref={inputRef}
          className={`book-input${error ? ' is-invalid' : ''}`}
          type={type}
          value={value}
          autoComplete={autoComplete}
          inputMode={inputMode}
          readOnly={locked}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
        {locked && (
          <svg className="book-lock" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        )}
      </div>
      {locked && lockedHint && <span id={`${id}-locked`} className="book-hint">{lockedHint}</span>}
      {hint && !locked && <span id={`${id}-hint`} className="book-hint">{hint}</span>}
      {error && <span id={`${id}-error`} className="book-error" role="alert">{error}</span>}
    </div>
  )
}

function CalendarSkeleton({ label }: { label: string }) {
  return (
    <div className="book-skel" role="status" aria-live="polite">
      <span className="book-sr-only">{label}</span>
      <div className="book-skel-head" aria-hidden="true" />
      <div className="book-skel-grid" aria-hidden="true">
        {Array.from({ length: 35 }, (_, i) => <span key={i} className="book-skel-cell" />)}
      </div>
    </div>
  )
}

function SlotsSkeleton() {
  return (
    <div className="book-skel" aria-hidden="true">
      <div className="book-skel-line" />
      <div className="book-skel-slots">
        {Array.from({ length: 6 }, (_, i) => <span key={i} className="book-skel-slot" />)}
      </div>
    </div>
  )
}
