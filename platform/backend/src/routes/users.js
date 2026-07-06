import { Router } from 'express'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Org from '../models/Org.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

router.use(requireAuth)

router.get('/org/:orgId', async (req, res) => {
  if (req.user.role !== 'super_admin' && req.user.org !== req.params.orgId) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  const users = await User.find({ org: req.params.orgId }).select('-password').sort({ createdAt: -1 })
  res.json(users)
})

router.post('/org/:orgId', requireRole('super_admin', 'org_admin'), async (req, res) => {
  const { email, password, name, role } = req.body
  if (!email || !password || !name) return res.status(400).json({ error: 'Email, password, name required' })

  const org = await Org.findById(req.params.orgId)
  if (!org) return res.status(404).json({ error: 'Org not found' })

  const exists = await User.findOne({ email: email.toLowerCase() })
  if (exists) return res.status(409).json({ error: 'Email already registered' })

  const hash = bcrypt.hashSync(password, 10)
  const user = await User.create({
    email,
    password: hash,
    name,
    role: role || 'user',
    org: org._id,
  })
  res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role, org: user.org })
})

router.put('/:id', async (req, res) => {
  const target = await User.findById(req.params.id)
  if (!target) return res.status(404).json({ error: 'Not found' })

  if (req.user.role !== 'super_admin' && req.user.org !== target.org?.toString()) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const updates = {}
  if (req.body.name) updates.name = req.body.name
  if (req.body.role && req.user.role === 'super_admin') updates.role = req.body.role
  if (req.body.password) updates.password = bcrypt.hashSync(req.body.password, 10)

  const user = await User.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true }).select('-password')
  res.json(user)
})

router.delete('/:id', async (req, res) => {
  const target = await User.findById(req.params.id)
  if (!target) return res.status(404).json({ error: 'Not found' })

  if (req.user.role !== 'super_admin' && req.user.org !== target.org?.toString()) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  await User.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

export default router
