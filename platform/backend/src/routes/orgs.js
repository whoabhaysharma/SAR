import { Router } from 'express'
import Org from '../models/Org.js'
import User from '../models/User.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

router.use(requireAuth)

router.get('/', requireRole('super_admin'), async (req, res) => {
  const orgs = await Org.find().sort({ createdAt: -1 })
  res.json(orgs)
})

router.post('/', requireRole('super_admin'), async (req, res) => {
  const { name, slug } = req.body
  if (!name || !slug) return res.status(400).json({ error: 'Name and slug required' })

  const exists = await Org.findOne({ slug })
  if (exists) return res.status(409).json({ error: 'Slug already taken' })

  const org = await Org.create({ name, slug })
  res.status(201).json(org)
})

router.get('/:id', async (req, res) => {
  if (req.user.role !== 'super_admin' && req.user.org !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  const org = await Org.findById(req.params.id)
  if (!org) return res.status(404).json({ error: 'Not found' })
  res.json(org)
})

router.put('/:id', requireRole('super_admin'), async (req, res) => {
  const org = await Org.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true })
  if (!org) return res.status(404).json({ error: 'Not found' })
  res.json(org)
})

router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  const org = await Org.findByIdAndDelete(req.params.id)
  if (!org) return res.status(404).json({ error: 'Not found' })
  res.json({ ok: true })
})

export default router
