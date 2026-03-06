import { randomUUID } from 'crypto'
import { TableClient } from '@azure/data-tables'

const DEFAULT_TABLE_NAME = 'ActivityEvents'
const MAX_IN_MEMORY_EVENTS = 3000

let cachedClient = null
const inMemoryEvents = []

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
    userAgent: clampText(event.userAgent, 300),
    referrer: clampText(event.referrer, 300),
    ipHash: clampText(event.ipHash, 120),
    elementTag: clampText(clickElement.tag, 80),
    elementId: clampText(clickElement.id, 120),
    elementText: clampText(clickElement.text, 220),
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
    .slice(0, Math.max(1, Math.min(Number(limit) || 300, 1000)))
}

export async function recordActivityEvent(event) {
  const entity = mapEventToEntity(event)

  if (!hasAzureStorage()) {
    inMemoryEvents.unshift(mapEntityToEvent(entity))
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
  const maxScan = 2500
  let events = []

  if (!hasAzureStorage()) {
    events = [...inMemoryEvents]
  } else {
    const client = await getTableClient()
    const entities = client.listEntities()
    for await (const entity of entities) {
      events.push(mapEntityToEvent(entity))
      if (events.length >= maxScan) break
    }
  }

  const filteredEvents = applyFilters(events, filters)

  return {
    events: filteredEvents,
    summary: summarize(filteredEvents),
    storage: hasAzureStorage() ? 'azure-table' : 'memory',
  }
}
