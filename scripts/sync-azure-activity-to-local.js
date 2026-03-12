/* eslint-disable no-console */
const os = require('os')
const path = require('path')
const { promises: fs } = require('fs')
const { TableClient } = require('@azure/data-tables')

const DEFAULT_TABLE_NAME = 'ActivityEvents'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const [rawKey, inlineValue] = token.slice(2).split('=')
    const key = rawKey.trim()
    const value = inlineValue !== undefined ? inlineValue : argv[i + 1]
    if (inlineValue === undefined && value && !value.startsWith('--')) i += 1
    args[key] = inlineValue !== undefined ? inlineValue : value
  }
  return args
}

function toLocalEvent(entity, fallbackId) {
  return {
    id: entity.rowKey || fallbackId,
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

function getOutputPath(args) {
  const configured = args.out || process.env.ACTIVITY_REPORT_FILE_PATH || ''
  if (configured.trim()) return configured
  return path.join(os.homedir(), '.pavillon46', 'activity-events.jsonl')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const connectionString = args.connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING || ''
  const tableName = args.table || process.env.AZURE_STORAGE_TABLE_NAME || DEFAULT_TABLE_NAME
  const max = Number(args.max || 0)
  const appendMode = args.append === '1' || args.append === 'true'

  if (!connectionString) {
    console.error('Missing connection string. Set AZURE_STORAGE_CONNECTION_STRING or pass --connectionString')
    process.exit(1)
  }

  const outPath = getOutputPath(args)
  await fs.mkdir(path.dirname(outPath), { recursive: true })

  const client = TableClient.fromConnectionString(connectionString, tableName)
  const entities = client.listEntities()
  const events = []
  let count = 0

  for await (const entity of entities) {
    events.push(toLocalEvent(entity, `entity-${count + 1}`))
    count += 1
    if (max > 0 && count >= max) break
  }

  events.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

  let existing = []
  if (appendMode) {
    try {
      const content = await fs.readFile(outPath, 'utf8')
      existing = content
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line)
          } catch {
            return null
          }
        })
        .filter(Boolean)
    } catch {
      existing = []
    }
  }

  const byId = new Map()
  for (const event of existing) byId.set(event.id, event)
  for (const event of events) byId.set(event.id, event)

  const merged = Array.from(byId.values()).sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
  const payload = merged.map((event) => JSON.stringify(event)).join('\n')
  await fs.writeFile(outPath, payload ? `${payload}\n` : '', 'utf8')

  const firstTs = merged[0]?.ts || '-'
  const lastTs = merged[merged.length - 1]?.ts || '-'
  console.log(`Synced ${events.length} events from Azure table "${tableName}".`)
  console.log(`Local file: ${outPath}`)
  console.log(`Total rows in file: ${merged.length}`)
  console.log(`Date range: ${firstTs} -> ${lastTs}`)
}

main().catch((error) => {
  console.error('Sync failed:', error?.message || error)
  process.exit(1)
})
