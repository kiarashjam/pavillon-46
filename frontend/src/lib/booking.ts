// Pure helpers for the meeting calendar (booking page and admin Meetings
// section). Dates are "YYYY-MM-DD" strings in Europe/Zurich, as the API sends
// them. They are turned into UTC-midnight Date objects only to do arithmetic
// and formatting, so the visitor's own time zone never shifts a day.

export type IsoDate = string
/** "YYYY-MM" */
export type YearMonth = string

function toUtc(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function fromUtc(date: Date): IsoDate {
  return date.toISOString().slice(0, 10)
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return fromUtc(toUtc(value)) === value
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUtc(d)
}

/** Days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000)
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: IsoDate): number {
  const day = toUtc(date).getUTCDay()
  return day === 0 ? 7 : day
}

export function yearMonthOf(date: IsoDate): YearMonth {
  return date.slice(0, 7)
}

export function addMonths(ym: YearMonth, months: number): YearMonth {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + months, 1))
  return fromUtc(d).slice(0, 7)
}

export function firstOfMonth(ym: YearMonth): IsoDate {
  return `${ym}-01`
}

export function lastOfMonth(ym: YearMonth): IsoDate {
  return addDays(firstOfMonth(addMonths(ym, 1)), -1)
}

/**
 * The weeks of a month, Monday first, as the calendar shows them: each week
 * has seven cells, a date or null for the padding before the 1st and after
 * the last day.
 */
export function monthGrid(ym: YearMonth): (IsoDate | null)[][] {
  const first = firstOfMonth(ym)
  const last = lastOfMonth(ym)
  const cells: (IsoDate | null)[] = Array.from({ length: isoWeekday(first) - 1 }, () => null)
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (IsoDate | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

const LOCALES = { fr: 'fr-CH', en: 'en-GB' } as const
type Lang = keyof typeof LOCALES

function format(date: IsoDate, lang: Lang, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(LOCALES[lang], { ...options, timeZone: 'UTC' }).format(toUtc(date))
}

/** "jeudi 19 novembre" / "Thursday 19 November" (with the year when asked).
 *  Built from two parts: with a year, Intl puts a comma after the weekday in
 *  some locales and not others, and the page should read the same either way. */
export function formatLongDate(date: IsoDate, lang: Lang, withYear = false): string {
  const weekday = format(date, lang, { weekday: 'long' })
  const rest = format(date, lang, { day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) })
  return `${weekday} ${rest}`
}

/** "novembre 2026" / "November 2026". */
export function formatMonth(ym: YearMonth, lang: Lang): string {
  return format(firstOfMonth(ym), lang, { month: 'long', year: 'numeric' })
}

/** Monday-first short weekday names: "lun." … / "Mon" … */
export function weekdayNames(lang: Lang, style: 'short' | 'long' | 'narrow' = 'short'): string[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => format(addDays('2024-01-01', i), lang, { weekday: style }))
}

export function capitalise(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text
}

/** "10:00" + 45 → "10:45". */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = (h * 60 + m + minutes) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Splits start times into the morning (before noon) and the afternoon. */
export function groupSlots(slots: string[]): { morning: string[]; afternoon: string[] } {
  return {
    morning: slots.filter((s) => s < '12:00'),
    afternoon: slots.filter((s) => s >= '12:00'),
  }
}

// --- .ics ------------------------------------------------------------------

function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function icsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** RFC 5545 folds lines longer than 75 octets; continuation lines start with a space. */
function fold(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  for (const char of line) {
    if (encoder.encode(current + char).length > (parts.length === 0 ? 75 : 74)) {
      parts.push(current)
      current = char
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts.join('\r\n ')
}

export interface IcsEvent {
  uid: string
  /** ISO 8601 with offset, as the booking API answers. */
  startsAt: string
  durationMinutes: number
  title: string
  location: string
  description: string
  /** Defaults to now. */
  stamp?: Date
}

/** A one-event calendar file any calendar app can import. */
export function buildIcs(event: IcsEvent): string {
  const start = new Date(event.startsAt)
  const end = new Date(start.getTime() + event.durationMinutes * 60_000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pavillon 46//Rendez-vous//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${icsUtc(event.stamp ?? new Date())}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${icsText(event.title)}`,
    `LOCATION:${icsText(event.location)}`,
    `DESCRIPTION:${icsText(event.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}
