import { getActivityReport } from '../../../lib/activityStore'

function isAuthorized(req) {
  const expectedKey = process.env.ACTIVITY_REPORT_KEY || ''
  if (!expectedKey) return false

  const providedKey =
    req.headers['x-report-key'] ||
    req.query.key ||
    req.cookies?.activity_report_key ||
    ''

  return String(providedKey) === expectedKey
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const { from, to, type = 'all', path = '', limit = '300' } = req.query

  try {
    const report = await getActivityReport({
      from: from || null,
      to: to || null,
      type: String(type),
      path: String(path),
      limit: Number(limit),
    })

    return res.status(200).json(report)
  } catch (error) {
    console.error('Activity report error:', error)
    return res.status(500).json({ message: 'Failed to load activity report' })
  }
}
