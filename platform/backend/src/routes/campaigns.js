import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import Campaign from '../models/Campaign.js'
import Org from '../models/Org.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

router.use(requireAuth)

router.get('/', async (req, res) => {
  let filter = {}
  if (req.user.role === 'super_admin') {
    // all campaigns
  } else if (req.user.role === 'org_admin') {
    filter = { org: req.user.org }
  } else {
    filter = { user: req.user.id }
  }
  const campaigns = await Campaign.find(filter)
    .populate('org', 'name slug')
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
  res.json(campaigns)
})

router.post('/', async (req, res) => {
  const { name, vastTagUrl } = req.body
  if (!name || !vastTagUrl) return res.status(400).json({ error: 'Name and vastTagUrl required' })

  const orgId = req.user.role === 'super_admin' ? req.body.org : req.user.org
  if (!orgId) return res.status(400).json({ error: 'Organization required' })

  const org = await Org.findById(orgId)
  if (!org) return res.status(404).json({ error: 'Org not found' })

  if (req.user.role !== 'super_admin' && req.user.role !== 'org_admin' && req.user.org !== orgId) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const publisherTag = `${org.slug}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${uuid().slice(0, 8)}`

  const campaign = await Campaign.create({
    org: orgId,
    user: req.user.id,
    name,
    vastTagUrl,
    publisherTag,
  })

  const configUrl = `${req.protocol}://${req.get('host')}/api/config/${publisherTag}`
  res.status(201).json({ ...campaign.toObject(), configUrl })
})

router.get('/:id', async (req, res) => {
  const campaign = await Campaign.findById(req.params.id)
    .populate('org', 'name slug')
    .populate('user', 'name email')
  if (!campaign) return res.status(404).json({ error: 'Not found' })

  if (req.user.role !== 'super_admin' && req.user.org !== campaign.org._id.toString()) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  res.json(campaign)
})

router.put('/:id', async (req, res) => {
  const campaign = await Campaign.findById(req.params.id)
  if (!campaign) return res.status(404).json({ error: 'Not found' })

  if (req.user.role !== 'super_admin' && req.user.org !== campaign.org.toString()) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const updates = {}
  if (req.body.name) updates.name = req.body.name
  if (req.body.vastTagUrl) updates.vastTagUrl = req.body.vastTagUrl

  const updated = await Campaign.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true })
  res.json(updated)
})

router.delete('/:id', async (req, res) => {
  const campaign = await Campaign.findById(req.params.id)
  if (!campaign) return res.status(404).json({ error: 'Not found' })

  if (req.user.role !== 'super_admin' && req.user.org !== campaign.org.toString()) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  await Campaign.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

export default router
