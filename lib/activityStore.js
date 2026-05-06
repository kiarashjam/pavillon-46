import { randomUUID } from 'crypto'
import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'
import { TableClient } from '@azure/data-tables'
import { publicClickText, publicReferrer, publicUserAgent, sanitizeEventForPrivacy } from './activityPrivacy'

const DEFAULT_TABLE_NAME = 'ActivityEvents'
const MAX_IN_MEMORY_EVENTS = Math.max(50000, Number(process.env.ACTIVITY_MAX_IN_MEMORY_EVENTS) || 50000)
const DEFAULT_MAX_REPORT_LIMIT = 50000
const DEFAULT_MAX_SCAN = 250000

let cachedClient = null
const inMemoryEvents = []

function getFileStoragePath() {
  const configuredPath = process.env.ACTIVITY_REPORT_FILE_PATH || ''
  if (configuredPath.trim()) return configuredPath
  return path.join(os.homedir(), '.pavillon46', 'activity-events.jsonl')
}

function hasFileStorage() {
  return process.env.ACTIVITY_REPORT_DISABLE_FILE !== '1'
}

async function ensureFileStorageReady() {
  const filePath = getFileStoragePath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.appendFile(filePath, '')
  return filePath
}

async function appendEventToFile(event) {
  const filePath = await ensureFileStorageReady()
  await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8')
}

async function readEventsFromFile(maxScan) {
  const filePath = await ensureFileStorageReady()
  const content = await fs.readFile(filePath, 'utf8')
  if (!content.trim()) return []

  const lines = content.split('\n').filter(Boolean)
  const events = []

  // Scan newest entries first so reports are fast on large files.
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    try {
      const parsed = JSON.parse(line)
      if (!parsed || typeof parsed !== 'object') continue
      events.push({
        id: parsed.id || `${index}`,
        type: parsed.type || 'unknown',
        path: parsed.path || '/',
        ts: parsed.ts || new Date().toISOString(),
        sessionId: parsed.sessionId || '',
        userAgent: parsed.userAgent || '',
        referrer: parsed.referrer || '',
        ipHash: parsed.ipHash || '',
        element: {
          tag: parsed.element?.tag || '',
          id: parsed.element?.id || '',
          text: parsed.element?.text || '',
        },
      })
    } catch {
      // Skip malformed lines so one bad row does not break reporting.
    }

    if (events.length >= maxScan) break
  }

  return events
}

function getConfig() {
  return {
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
    tableName: process.env.AZURE_STORAGE_TABLE_NAME || DEFAULT_TABLE_NAME,
  }
}

function hasAzureStorage() {
  const { connectionString } = getConfig()
  return Boolean(connectionString)
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function parseTs(value) {
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? 0 : ts
}

function resolveMaxReportLimit() {
  const configured = Number(process.env.ACTIVITY_REPORT_MAX_LIMIT)
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_MAX_REPORT_LIMIT
  return configured
}

function resolveMaxScan() {
  const configured = Number(process.env.ACTIVITY_REPORT_MAX_SCAN)
  // ACTIVITY_REPORT_MAX_SCAN=0 means scan without cap for full-history reports.
  if (configured === 0) return Number.MAX_SAFE_INTEGER
  if (!Number.isFinite(configured) || configured < 0) return DEFAULT_MAX_SCAN
  return Math.max(5000, configured)
}

function toDayPartition(isoTs) {
  return (isoTs || '').slice(0, 10) || new Date().toISOString().slice(0, 10)
}

function clampText(value, max = 300) {
  if (!value) return ''
  return String(value).slice(0, max)
}

async function getTableClient() {
  if (!hasAzureStorage()) return null
  if (cachedClient) return cachedClient

  const { connectionString, tableName } = getConfig()
  const client = TableClient.fromConnectionString(connectionString, tableName)
  await client.createTable()
  cachedClient = client
  return cachedClient
}

function mapEventToEntity(event) {
  const ts = toIso(event.ts) || new Date().toISOString()
  const clickElement = event.element || {}
  const rowKey = `${Date.now()}-${randomUUID()}`

  return {
    partitionKey: toDayPartition(ts),
    rowKey,
    type: clampText(event.type, 32),
    path: clampText(event.path, 512),
    ts,
    sessionId: clampText(event.sessionId, 120),
    userAgent: clampText(publicUserAgent(event.userAgent), 300),
    referrer: clampText(publicReferrer(event.referrer), 300),
    ipHash: clampText(event.ipHash, 120),
    elementTag: clampText(clickElement.tag, 80),
    elementId: clampText(clickElement.id, 120),
    elementText: clampText(publicClickText(clickElement.text, 48), 220),
  }
}

function mapEntityToEvent(entity) {
  return {
    id: entity.rowKey,
    type: entity.type || 'unknown',
    path: entity.path || '/',
    ts: entity.ts || entity.Timestamp || new Date().toISOString(),
    sessionId: entity.sessionId || '',
    userAgent: entity.userAgent || '',
    referrer: entity.referrer || '',
    ipHash: entity.ipHash || '',
    element: {
      tag: entity.elementTag || '',
      id: entity.elementId || '',
      text: entity.elementText || '',
    },
  }
}

function summarize(events) {
  const totalEvents = events.length
  const pageViews = events.filter((event) => event.type === 'page_view').length
  const clicks = events.filter((event) => event.type === 'click').length
  const uniqueSessions = new Set(events.map((event) => event.sessionId).filter(Boolean)).size

  const pageCounts = new Map()
  const clickCounts = new Map()

  for (const event of events) {
    if (event.path) {
      pageCounts.set(event.path, (pageCounts.get(event.path) || 0) + 1)
    }

    if (event.type === 'click') {
      const label = [event.element?.tag, event.element?.id || event.element?.text]
        .filter(Boolean)
        .join(' - ')
      const key = label || '(unknown element)'
      clickCounts.set(key, (clickCounts.get(key) || 0) + 1)
    }
  }

  const topPages = Array.from(pageCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([path, count]) => ({ path, count }))

  const topClicks = Array.from(clickCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }))

  return {
    totalEvents,
    pageViews,
    clicks,
    uniqueSessions,
    topPages,
    topClicks,
  }
}

function applyFilters(events, { from, to, type, path, limit = 300 }) {
  const fromTs = from ? parseTs(from) : null
  const toTs = to ? parseTs(to) : null
  const pathNeedle = (path || '').trim().toLowerCase()

  const filtered = events.filter((event) => {
    const eventTs = parseTs(event.ts)
    if (fromTs && eventTs < fromTs) return false
    if (toTs && eventTs > toTs) return false
    if (type && type !== 'all' && event.type !== type) return false
    if (pathNeedle && !String(event.path || '').toLowerCase().includes(pathNeedle)) return false
    return true
  })

  return filtered
    .sort((a, b) => parseTs(b.ts) - parseTs(a.ts))
    .slice(0, Math.max(1, Math.min(Number(limit) || 300, resolveMaxReportLimit())))
}

export async function recordActivityEvent(event) {
  const entity = mapEventToEntity(event)
  const mappedEvent = mapEntityToEvent(entity)

  if (!hasAzureStorage()) {
    if (hasFileStorage()) {
      try {
        await appendEventToFile(mappedEvent)
        return { storage: 'file' }
      } catch (error) {
        console.error('Activity file write failed, falling back to memory:', error)
      }
    }

    inMemoryEvents.unshift(mappedEvent)
    if (inMemoryEvents.length > MAX_IN_MEMORY_EVENTS) {
      inMemoryEvents.splice(MAX_IN_MEMORY_EVENTS)
    }
    return { storage: 'memory' }
  }

  const client = await getTableClient()
  await client.createEntity(entity)
  return { storage: 'azure-table' }
}

export async function getActivityReport(filters = {}) {
  const maxScan = resolveMaxScan()
  let events = []
  let storage = 'memory'

  if (hasAzureStorage()) {
    const client = await getTableClient()
    const entities = client.listEntities()
    for await (const entity of entities) {
      events.push(mapEntityToEvent(entity))
      if (events.length >= maxScan) break
    }
    storage = 'azure-table'
  } else if (hasFileStorage()) {
    try {
      events = await readEventsFromFile(maxScan)
      storage = 'file'
    } catch (error) {
      console.error('Activity file read failed, falling back to memory:', error)
      events = [...inMemoryEvents]
      storage = 'memory'
    }
  } else {
    events = [...inMemoryEvents]
    storage = 'memory'
  }

  events = events.map(sanitizeEventForPrivacy)

  const filteredEvents = applyFilters(events, filters)
  const sortedAllEvents = [...events].sort((a, b) => parseTs(b.ts) - parseTs(a.ts))
  const latestEventTs = sortedAllEvents[0]?.ts || null
  const oldestEventTs = sortedAllEvents[sortedAllEvents.length - 1]?.ts || null

  return {
    events: filteredEvents,
    summary: summarize(filteredEvents),
    meta: {
      scannedEvents: events.length,
      maxScan: Number.isFinite(maxScan) && maxScan < Number.MAX_SAFE_INTEGER ? maxScan : null,
      truncated: events.length >= maxScan,
      latestEventTs,
      oldestEventTs,
    },
    storage,
  }
}
