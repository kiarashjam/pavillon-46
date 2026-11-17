import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import {
  ApiError,
  adminCancelMeetingBooking,
  adminResendMeetingBooking,
  adminGetMeetingSettings,
  adminListMeetingBookings,
  adminListMeetingDays,
  adminSetMeetingDay,
  adminUpdateMeetingSettings,
  type AdminMeetingDayDto,
  type MeetingBookingDto,
  type MeetingDayStatus,
  type MeetingSettingsDto,
  type MeetingWeekdayDto,
} from '../../lib/api'
import {
  addMonths,
  capitalise,
  firstOfMonth,
  formatLongDate,
  formatMonth,
  isoWeekday,
  lastOfMonth,
  monthGrid,
  weekdayNames,
  yearMonthOf,
  type IsoDate,
  type YearMonth,
} from '../../lib/booking'
import type { AdminCtx } from '../../components/admin/AdminLayout'
import AdminModal from '../../components/admin/AdminModal'
import { AdminEmpty, AdminSkeletonRows } from '../../components/admin/adminUi'

type Tab = 'calendar' | 'bookings' | 'rules'
type BookingFilter = 'upcoming' | 'past' | 'cancelled' | 'all'

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'calendar', label: 'Calendar', hint: 'Open, fill or close any day with one click' },
  { id: 'bookings', label: 'Bookings', hint: 'Who is coming, and when' },
  { id: 'rules', label: 'Hours & rules', hint: 'Weekly hours, slot length, notice and who is told' },
]

const STATUS_LABEL: Record<MeetingDayStatus, string> = { open: 'Open', full: 'Full', closed: 'Closed' }
const STATUSES: MeetingDayStatus[] = ['open', 'full', 'closed']
const WEEKDAY_LONG = weekdayNames('en', 'long')
const SLOT_CHOICES = [15, 20, 30, 45, 60, 75, 90, 120]
const BOOKING_PAGE = '/rendez-vous'

function parseTab(raw: string | null): Tab {
  return raw === 'bookings' || raw === 'rules' ? raw : 'calendar'
}

function zurichToday(): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date())
}

function slotCount(from: string, to: string, minutes: number): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to) || minutes <= 0) return 0
  return Math.max(0, Math.floor((toMin(to) - toMin(from)) / minutes))
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

export default function AdminMeetingsSection() {
  const { token } = useOutletContext<AdminCtx>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const tab = parseTab(params.get('tab'))

  useEffect(() => {
    document.title = 'Meetings · Admin · Pavillon 46'
  }, [])

  const setTab = (next: Tab) => navigate(`/admin/meetings?tab=${next}`, { replace: true })

  // ---- bookings (also feed the KPI strip) --------------------------------
  const [bookings, setBookings] = useState<MeetingBookingDto[] | null>(null)
  const [bookingsError, setBookingsError] = useState<string | null>(null)
  const loadBookings = useCallback(async () => {
    setBookingsError(null)
    try {
      const res = await adminListMeetingBookings(token)
      setBookings(res.bookings)
    } catch (e) {
      setBookingsError(errorText(e, 'Could not load the bookings.'))
    }
  }, [token])
  useEffect(() => {
    void loadBookings()
  }, [loadBookings])

  const now = Date.now()
  const upcoming = (bookings ?? []).filter((b) => b.status === 'booked' && Date.parse(b.startsAt) >= now)
  const thisWeek = upcoming.filter((b) => Date.parse(b.startsAt) < now + 7 * 86_400_000)
  const next = upcoming[0]

  const [dayFilter, setDayFilter] = useState<IsoDate | null>(null)
  const showDay = (date: IsoDate) => {
    setDayFilter(date)
    setTab('bookings')
  }

  const current = TABS.find((t) => t.id === tab) ?? TABS[0]

  return (
    <>
      <div className="adash-head">
        <div>
          <p className="adash-kicker">Calendar &amp; bookings</p>
          <h2>Meetings</h2>
          <p>{current.hint}.</p>
        </div>
        <div className="adash-head-actions">
          <a className="adash-btn adash-btn-ghost adash-mtg-page-link" href={BOOKING_PAGE} target="_blank" rel="noopener noreferrer">
            Booking page ↗
          </a>
        </div>
      </div>

      <div className="adash-kpi-grid adash-kpi-grid-3">
        <div className="adash-kpi adash-kpi-compact">
          <span className="adash-kpi-label">Upcoming</span>
          <strong className="adash-kpi-value">{bookings ? upcoming.length : '—'}</strong>
          <span className="adash-kpi-sub">meetings booked ahead</span>
        </div>
        <div className="adash-kpi adash-kpi-compact">
          <span className="adash-kpi-label">Next 7 days</span>
          <strong className="adash-kpi-value">{bookings ? thisWeek.length : '—'}</strong>
          <span className="adash-kpi-sub">in the coming week</span>
        </div>
        <div className="adash-kpi adash-kpi-compact">
          <span className="adash-kpi-label">Next meeting</span>
          <strong className="adash-kpi-value adash-mtg-kpi-next">
            {next ? `${capitalise(formatLongDate(next.date, 'en').replace(/ \d{4}$/, ''))}, ${next.time}` : '—'}
          </strong>
          <span className="adash-kpi-sub">{next ? `${next.firstName} ${next.lastName}` : 'nothing booked yet'}</span>
        </div>
      </div>

      <div className="adash-people-tabs" role="tablist" aria-label="Meetings">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`adash-people-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span>{t.label}</span>
            {t.id === 'bookings' && bookings && <em>{upcoming.length}</em>}
          </button>
        ))}
      </div>

      {tab === 'calendar' && <MeetingCalendarPanel token={token} onShowDay={showDay} bookingsVersion={bookings} />}
      {tab === 'bookings' && (
        <MeetingBookingsPanel
          token={token}
          bookings={bookings}
          error={bookingsError}
          onReload={loadBookings}
          dayFilter={dayFilter}
          onClearDay={() => setDayFilter(null)}
        />
      )}
      {tab === 'rules' && <MeetingRulesPanel token={token} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Calendar: one click sets a day open, full or closed.
// ---------------------------------------------------------------------------

function MeetingCalendarPanel({
  token,
  onShowDay,
  bookingsVersion,
}: {
  token: string
  onShowDay: (date: IsoDate) => void
  bookingsVersion: unknown
}) {
  const [month, setMonth] = useState<YearMonth>(() => yearMonthOf(zurichToday()))
  const [days, setDays] = useState<Record<IsoDate, AdminMeetingDayDto>>({})
  const [today, setToday] = useState<IsoDate>(zurichToday())
  const [lastDate, setLastDate] = useState<IsoDate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<IsoDate | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const requestId = useRef(0)
  const headingId = useId()

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const res = await adminListMeetingDays(token, firstOfMonth(month), lastOfMonth(month))
      if (id !== requestId.current) return
      setToday(res.today)
      setLastDate(res.lastDate)
      setDays(Object.fromEntries(res.days.map((d) => [d.date, d])))
    } catch (e) {
      if (id === requestId.current) setError(errorText(e, 'Could not load the calendar.'))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [token, month])

  // Reload when the month changes, and when bookings change elsewhere (a cancel).
  useEffect(() => {
    void load()
  }, [load, bookingsVersion])

  const setStatus = async (date: IsoDate, status: MeetingDayStatus) => {
    const day = days[date]
    if (!day || day.configured === status || saving) return
    setSaving(date)
    setNotice(null)
    // Back to the weekday's own rule when that is what was chosen.
    const send = status === (day.weekdayOpen ? 'open' : 'closed') ? 'default' : status
    try {
      const updated = await adminSetMeetingDay(token, date, send)
      setDays((prev) => ({ ...prev, [date]: updated }))
      setNotice(`${capitalise(formatLongDate(date, 'en'))} is now ${STATUS_LABEL[updated.configured].toLowerCase()}.`)
    } catch (e) {
      setNotice(null)
      setError(errorText(e, 'Could not change that day.'))
    } finally {
      setSaving(null)
    }
  }

  const weeks = useMemo(() => monthGrid(month), [month])
  const shortNames = weekdayNames('en', 'short')
  const minMonth = yearMonthOf(today)
  const monthBookings = Object.values(days).reduce((n, d) => n + d.bookings, 0)
  const monthFree = Object.values(days).reduce((n, d) => n + (d.status === 'open' ? d.free : 0), 0)

  return (
    <section className="adash-panel adash-mtg-cal" aria-labelledby={headingId}>
      <div className="adash-mtg-cal-head">
        <button
          type="button"
          className="adash-btn adash-btn-ghost adash-btn-sm"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          disabled={month <= minMonth}
          aria-label="Previous month"
        >
          ←
        </button>
        <div className="adash-mtg-cal-title">
          <h3 id={headingId}>{capitalise(formatMonth(month, 'en'))}</h3>
          <p>{monthBookings} booked · {monthFree} free times left</p>
        </div>
        <button
          type="button"
          className="adash-btn adash-btn-ghost adash-btn-sm"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <p className="adash-mtg-legend">
        <span><i className="is-open" /> Open — bookable</span>
        <span><i className="is-full" /> Full — shown as full</span>
        <span><i className="is-closed" /> Closed</span>
        <span className="adash-mtg-legend-note">● set by hand, otherwise the weekday’s rule</span>
      </p>

      {error && <p className="adash-error" role="alert">{error}</p>}
      <p className="adash-mtg-live" aria-live="polite">{notice}</p>

      {loading && Object.keys(days).length === 0 ? (
        <AdminSkeletonRows rows={5} />
      ) : (
        <div className={`adash-mtg-grid${loading ? ' is-loading' : ''}`} role="list" aria-label={`Days of ${formatMonth(month, 'en')}`}>
          {shortNames.map((n) => (
            <span key={n} className="adash-mtg-dow" aria-hidden="true">{n}</span>
          ))}
          {weeks.flat().map((date, i) => {
            if (!date) return <span key={`pad-${i}`} className="adash-mtg-pad" aria-hidden="true" />
            const d = days[date]
            const past = date < today
            const label = capitalise(formatLongDate(date, 'en'))
            return (
              <div
                key={date}
                role="listitem"
                className={`adash-mtg-day is-${d?.configured ?? 'closed'}${past ? ' is-past' : ''}${date === today ? ' is-today' : ''}`}
              >
                <div className="adash-mtg-day-top">
                  <span className="adash-mtg-day-num">
                    <span className="adash-mtg-day-dow">{WEEKDAY_LONG[isoWeekday(date) - 1]} </span>
                    {Number(date.slice(8))}
                    {d?.source === 'override' && <span className="adash-mtg-day-mark" title="Set by hand for this date">●</span>}
                  </span>
                  {d && d.bookings > 0 ? (
                    <button type="button" className="adash-mtg-count" onClick={() => onShowDay(date)} aria-label={`${d.bookings} booked on ${label} — show them`}>
                      {d.bookings} booked
                    </button>
                  ) : null}
                </div>
                {d && (
                  <p className="adash-mtg-day-sub">
                    {past
                      ? 'Past'
                      : d.configured === 'open'
                        ? d.status === 'open'
                          ? `${d.free} free · ${d.from}–${d.to}`
                          : d.status === 'full'
                            ? 'No time left'
                            : d.slots === 0
                              ? 'No slot fits these hours'
                              : lastDate && date > lastDate ? 'Beyond the booking horizon' : 'Inside the minimum notice'
                        : STATUS_LABEL[d.configured]}
                  </p>
                )}
                {d && !past && (
                  <div className="adash-seg adash-seg-sm adash-mtg-seg" role="group" aria-label={`${label}: availability`}>
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={d.configured === s}
                        disabled={saving === date}
                        onClick={() => void setStatus(date, s)}
                        title={STATUS_LABEL[s]}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Bookings: upcoming first, cancel with a confirmation.
// ---------------------------------------------------------------------------

function MeetingBookingsPanel({
  token,
  bookings,
  error,
  onReload,
  dayFilter,
  onClearDay,
}: {
  token: string
  bookings: MeetingBookingDto[] | null
  error: string | null
  onReload: () => Promise<void>
  dayFilter: IsoDate | null
  onClearDay: () => void
}) {
  const [filter, setFilter] = useState<BookingFilter>('upcoming')
  const [confirming, setConfirming] = useState<MeetingBookingDto | null>(null)
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const titleId = useId()

  const now = Date.now()
  const rows = (bookings ?? []).filter((b) => {
    if (dayFilter) return b.date === dayFilter
    const future = Date.parse(b.startsAt) >= now
    if (filter === 'upcoming') return b.status === 'booked' && future
    if (filter === 'past') return b.status === 'booked' && !future
    if (filter === 'cancelled') return b.status === 'cancelled'
    return true
  })

  const cancel = async () => {
    if (!confirming) return
    setBusy(true)
    setActionError(null)
    try {
      const res = await adminCancelMeetingBooking(token, confirming.id)
      const who = `${res.booking.firstName} ${res.booking.lastName}`.trim()
      setNotice(res.emailed
        ? `Cancelled. ${who} has been emailed a short note.`
        : `Cancelled. No email could be sent to ${who} — let them know yourself.`)
      setConfirming(null)
      await onReload()
    } catch (e) {
      if (e instanceof ApiError && e.errorType === 'already_cancelled') {
        setConfirming(null)
        await onReload()
      } else {
        setActionError(errorText(e, 'Could not cancel this booking.'))
      }
    } finally {
      setBusy(false)
    }
  }

  const resend = async (b: MeetingBookingDto) => {
    setResending(b.id)
    setActionError(null)
    setNotice(null)
    try {
      const res = await adminResendMeetingBooking(token, b.id)
      const who = `${b.firstName} ${b.lastName}`.trim()
      setNotice(res.synced
        ? `${who} is now in CadenceE.`
        : `Still not in CadenceE: ${res.booking.crm.lastError ?? 'it could not be sent'}`)
      await onReload()
    } catch (e) {
      setActionError(errorText(e, 'Could not send it again.'))
    } finally {
      setResending(null)
    }
  }

  const pendingCount = (bookings ?? []).filter((b) => b.crm.pending).length

  const fmtWhen = (b: MeetingBookingDto) => capitalise(formatLongDate(b.date, 'en', true))

  return (
    <>
      <div className="adash-head-actions adash-people-toolbar">
        {dayFilter ? (
          <span className="adash-mtg-chip">
            {capitalise(formatLongDate(dayFilter, 'en', true))}
            <button type="button" className="adash-link" onClick={onClearDay}>Show all</button>
          </span>
        ) : (
          <div className="adash-seg" role="group" aria-label="Show">
            {(['upcoming', 'past', 'cancelled', 'all'] as BookingFilter[]).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'upcoming' ? 'Upcoming' : f === 'past' ? 'Past' : f === 'cancelled' ? 'Cancelled' : 'All'}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="adash-btn adash-btn-ghost adash-btn-sm" onClick={() => void onReload()}>
          Refresh
        </button>
      </div>

      {notice && <p className="adash-mtg-ok" role="status">{notice}</p>}
      {error && <p className="adash-error" role="alert">{error}</p>}
      {actionError && !confirming && <p className="adash-error" role="alert">{actionError}</p>}
      {pendingCount > 0 && (
        <p className="adash-mtg-warn" role="status">
          {pendingCount === 1 ? '1 booking is' : `${pendingCount} bookings are`} not yet in CadenceE.
          They are resent automatically for 7 days unless CadenceE refused them; use “Send again” once the cause is fixed.
        </p>
      )}

      <div className="adash-panel adash-panel-flush">
        {bookings === null && !error ? (
          <div role="status" aria-live="polite">
            <p className="adash-empty-hint" style={{ margin: 0, padding: '16px 16px 0' }}>Loading bookings…</p>
            <AdminSkeletonRows rows={4} />
          </div>
        ) : rows.length === 0 ? (
          <AdminEmpty
            title={dayFilter ? 'No booking that day' : filter === 'upcoming' ? 'No upcoming meeting' : 'Nothing here'}
            hint={filter === 'upcoming' && !dayFilter
              ? 'Bookings from the page and from CadenceE invitations appear here as they arrive.'
              : undefined}
          />
        ) : (
          <div className="adash-table-wrap">
            <table className="adash-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">Message</th>
                  <th scope="col">From</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className="adash-strong">{fmtWhen(b)}</span>
                      <br />
                      <span className="adash-person-sub">{b.time} · {b.durationMinutes} min</span>
                    </td>
                    <td>
                      <span className="adash-strong">{b.firstName} {b.lastName}</span>
                      <br />
                      <a className="adash-link" href={`mailto:${b.email}`}>{b.email}</a>
                      <br />
                      <a className="adash-person-sub adash-mtg-tel" href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}>{b.phone}</a>
                    </td>
                    <td className="adash-mtg-msg">{b.message ? <span title={b.message}>{b.message}</span> : <span className="adash-person-sub">—</span>}</td>
                    <td>
                      {b.crmLeadId ? (
                        <span className="adash-pill is-tag" title="Linked to the lead in CadenceE">{b.code || 'CadenceE'}</span>
                      ) : (
                        <span className="adash-person-sub">Direct</span>
                      )}
                      <br />
                      <span className="adash-person-sub">{b.language.toUpperCase()}</span>
                      {b.crm.pending && (
                        <span className="adash-mtg-crm">
                          <span
                            className={`adash-mtg-crm-flag${b.crm.halted ? ' is-halted' : ''}`}
                            title={[b.crm.lastError, b.crm.nextAttemptAt && !b.crm.halted
                              ? `Next automatic try: ${new Date(b.crm.nextAttemptAt).toLocaleString('en-GB')}`
                              : null].filter(Boolean).join(' — ') || undefined}
                          >
                            {b.crm.halted ? 'Refused by CadenceE' : 'Not yet in CadenceE'}
                          </span>
                          <button
                            type="button"
                            className="adash-link"
                            onClick={() => void resend(b)}
                            disabled={resending === b.id}
                            aria-label={`Send ${b.firstName} ${b.lastName}'s booking to CadenceE again`}
                          >
                            {resending === b.id ? 'Sending…' : 'Send again'}
                          </button>
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`adash-pill ${b.status === 'booked' ? 'is-active' : 'is-declined'}`}>
                        {b.status === 'booked' ? 'Booked' : 'Cancelled'}
                      </span>
                    </td>
                    <td>
                      {b.status === 'booked' && Date.parse(b.startsAt) >= now && (
                        <button type="button" className="adash-btn adash-btn-danger adash-btn-sm" onClick={() => { setActionError(null); setConfirming(b) }}>
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirming && (
        <AdminModal titleId={titleId} onClose={() => !busy && setConfirming(null)}>
          <div className="adash-modal-head">
            <div>
              <h2 id={titleId}>Cancel this meeting?</h2>
              <p>{confirming.firstName} {confirming.lastName} · {fmtWhen(confirming)} at {confirming.time}</p>
            </div>
          </div>
          <p className="adash-hint">
            The time becomes free again, {confirming.firstName || 'the person'} receives a short, polite email
            {confirming.crmLeadId ? ', and CadenceE is told so the lead shows it' : ''}. This cannot be undone.
          </p>
          {actionError && <p className="adash-error" role="alert">{actionError}</p>}
          <div className="adash-detail-foot">
            <button type="button" className="adash-btn adash-btn-danger" onClick={() => void cancel()} disabled={busy}>
              {busy ? 'Cancelling…' : 'Cancel the meeting'}
            </button>
            <button type="button" className="adash-btn adash-btn-ghost" onClick={() => setConfirming(null)} disabled={busy}>
              Keep it
            </button>
          </div>
        </AdminModal>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Hours & rules
// ---------------------------------------------------------------------------

function MeetingRulesPanel({ token }: { token: string }) {
  const [saved, setSaved] = useState<MeetingSettingsDto | null>(null)
  const [draft, setDraft] = useState<MeetingSettingsDto | null>(null)
  const [emailsText, setEmailsText] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const adopt = (s: MeetingSettingsDto) => {
    setSaved(s)
    setDraft(s)
    setEmailsText(s.notifyEmails.join(', '))
  }

  useEffect(() => {
    let alive = true
    adminGetMeetingSettings(token)
      .then((s) => alive && adopt(s))
      .catch((e) => alive && setLoadError(errorText(e, 'Could not load the settings.')))
    return () => {
      alive = false
    }
  }, [token])

  const emails = emailsText.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean)
  const badEmail = emails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e))
  const badDay = draft?.weekdays.find((w) => w.open && !(w.from < w.to))
  const dirty = !!draft && !!saved && (JSON.stringify({ ...draft, notifyEmails: emails }) !== JSON.stringify(saved))

  const setDay = (day: number, patch: Partial<MeetingWeekdayDto>) =>
    setDraft((d) => d && { ...d, weekdays: d.weekdays.map((w) => (w.day === day ? { ...w, ...patch } : w)) })

  const save = async () => {
    if (!draft || badEmail || badDay) return
    setSaving(true)
    setSaveError(null)
    setNotice(null)
    try {
      const res = await adminUpdateMeetingSettings(token, {
        slotMinutes: draft.slotMinutes,
        weekdays: draft.weekdays,
        minNoticeHours: draft.minNoticeHours,
        horizonDays: draft.horizonDays,
        notifyEmails: emails,
      })
      adopt(res)
      setNotice('Saved. The booking page uses the new rules now.')
    } catch (e) {
      setSaveError(errorText(e, 'Could not save the settings.'))
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <p className="adash-error" role="alert">{loadError}</p>
  if (!draft) {
    return (
      <div className="adash-panel" role="status" aria-live="polite">
        <p className="adash-empty-hint" style={{ margin: 0 }}>Loading the rules…</p>
        <AdminSkeletonRows rows={4} />
      </div>
    )
  }

  return (
    <form
      className="adash-mtg-rules"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <section className="adash-panel" aria-labelledby="mtg-hours">
        <div className="adash-panel-head">
          <h3 id="mtg-hours">Weekly hours <span className="adash-h3-sub">· Swiss time (Europe/Zurich)</span></h3>
        </div>
        <div className="adash-mtg-week">
          {draft.weekdays.map((w) => {
            const name = WEEKDAY_LONG[w.day - 1]
            const count = slotCount(w.from, w.to, draft.slotMinutes)
            return (
              <div key={w.day} className={`adash-mtg-weekday${w.open ? '' : ' is-off'}`}>
                <label className="adash-check adash-mtg-weekday-name">
                  <input type="checkbox" checked={w.open} onChange={(e) => setDay(w.day, { open: e.target.checked })} />
                  <span>{name}</span>
                </label>
                <label className="adash-mtg-time">
                  <span className="sr-only">{name} from</span>
                  <input className="adash-input" type="time" step={300} value={w.from} onChange={(e) => setDay(w.day, { from: e.target.value })} />
                </label>
                <span className="adash-person-sub" aria-hidden="true">to</span>
                <label className="adash-mtg-time">
                  <span className="sr-only">{name} until</span>
                  <input className="adash-input" type="time" step={300} value={w.to} onChange={(e) => setDay(w.day, { to: e.target.value })} />
                </label>
                <span className={`adash-mtg-weekday-count${w.open && !(w.from < w.to) ? ' is-bad' : ''}`}>
                  {w.open ? (w.from < w.to ? `${count} slot${count === 1 ? '' : 's'}` : 'End before start') : 'Closed'}
                </span>
              </div>
            )
          })}
        </div>
        <p className="adash-hint">A closed weekday keeps its hours: opening one of its dates in the calendar uses them.</p>
      </section>

      <section className="adash-panel" aria-labelledby="mtg-rules">
        <div className="adash-panel-head"><h3 id="mtg-rules">Booking rules</h3></div>
        <div className="adash-form-grid">
          <div className="adash-field">
            <label htmlFor="mtg-slot">Meeting length</label>
            <select id="mtg-slot" className="adash-select" value={draft.slotMinutes} onChange={(e) => setDraft({ ...draft, slotMinutes: Number(e.target.value) })}>
              {[...new Set([...SLOT_CHOICES, draft.slotMinutes])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>{m} minutes</option>
              ))}
            </select>
          </div>
          <div className="adash-field">
            <label htmlFor="mtg-notice">Minimum notice (hours)</label>
            <input id="mtg-notice" className="adash-input" type="number" min={0} max={720} value={draft.minNoticeHours}
              onChange={(e) => setDraft({ ...draft, minNoticeHours: Math.max(0, Math.min(720, Number(e.target.value) || 0)) })} />
            <span className="adash-hint">No booking starts sooner than this from now.</span>
          </div>
          <div className="adash-field">
            <label htmlFor="mtg-horizon">Bookable up to (days ahead)</label>
            <input id="mtg-horizon" className="adash-input" type="number" min={1} max={365} value={draft.horizonDays}
              onChange={(e) => setDraft({ ...draft, horizonDays: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} />
          </div>
          <div className="adash-field full">
            <label htmlFor="mtg-emails">Tell these addresses about each booking</label>
            <input id="mtg-emails" className="adash-input" value={emailsText} onChange={(e) => setEmailsText(e.target.value)}
              aria-invalid={!!badEmail} aria-describedby="mtg-emails-hint" placeholder="info@pavillon46.ch" />
            <span id="mtg-emails-hint" className={`adash-hint${badEmail || emails.length === 0 ? ' warn' : ''}`}>
              {badEmail
                ? `“${badEmail}” is not a valid address.`
                : emails.length === 0
                  ? 'With no address, nobody is told about new bookings.'
                  : 'Separate several addresses with commas.'}
            </span>
          </div>
        </div>
      </section>

      {saveError && <p className="adash-error" role="alert">{saveError}</p>}
      <div className="adash-detail-foot adash-sticky-foot">
        <button type="submit" className="adash-btn adash-btn-primary" disabled={!dirty || saving || !!badEmail || !!badDay}>
          {saving ? 'Saving…' : 'Save rules'}
        </button>
        <button type="button" className="adash-btn adash-btn-ghost" disabled={!dirty || saving} onClick={() => saved && adopt(saved)}>
          Discard changes
        </button>
        <span className="adash-hint" role="status">{notice ?? (dirty ? 'Unsaved changes' : '')}</span>
      </div>
    </form>
  )
}
