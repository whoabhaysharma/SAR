import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.use(requireAuth)

const CH = process.env.CLICKHOUSE_HOST || 'http://localhost:8123'
const CH_USER = process.env.CLICKHOUSE_USER || 'default'
const CH_PASS = process.env.CLICKHOUSE_PASSWORD || ''
const CH_DB = process.env.CLICKHOUSE_DB || 'analytics'

async function queryCH(sql) {
  const auth = CH_USER ? 'Basic ' + Buffer.from(`${CH_USER}:${CH_PASS}`).toString('base64') : ''
  const res = await fetch(`${CH}/?database=${CH_DB}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', ...(auth ? { Authorization: auth } : {}) },
    body: sql,
  })
  if (!res.ok) throw new Error(`CH error: ${res.status}`)
  return res.json()
}

router.get('/campaign/:tag', async (req, res) => {
  try {
    const data = await queryCH(`
      SELECT
        event,
        publisher,
        slot,
        tag,
        count() as count,
        toStartOfHour(time) as hour
      FROM ${CH_DB}.ad_events
      WHERE tag = '${req.params.tag}'
      GROUP BY event, publisher, slot, tag, hour
      ORDER BY hour DESC
      LIMIT 1000
      FORMAT JSON
    `)
    res.json(data.data || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/summary', async (req, res) => {
  try {
    const total = await queryCH(`SELECT count() as c FROM ${CH_DB}.ad_events FORMAT JSON`)
    const byEvent = await queryCH(`
      SELECT event, count() as c FROM ${CH_DB}.ad_events
      GROUP BY event ORDER BY c DESC FORMAT JSON
    `)
    const byPublisher = await queryCH(`
      SELECT publisher, count() as c FROM ${CH_DB}.ad_events
      GROUP BY publisher ORDER BY c DESC LIMIT 20 FORMAT JSON
    `)
    res.json({
      total: total.data?.[0]?.c || 0,
      byEvent: byEvent.data || [],
      byPublisher: byPublisher.data || [],
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/recent', async (req, res) => {
  try {
    const data = await queryCH(`
      SELECT event, publisher, slot, tag, time, quartile, duration, error
      FROM ${CH_DB}.ad_events
      ORDER BY time DESC LIMIT ${Math.min(parseInt(req.query.limit) || 100, 500)}
      FORMAT JSON
    `)
    res.json(data.data || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
