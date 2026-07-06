import { Router } from 'express'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Org from '../models/Org.js'
import { signToken, requireAuth } from '../middleware/auth.js'

const router = Router()

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

  const user = await User.findOne({ email: email.toLowerCase() })
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const token = signToken(user)
  res.json({
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role, org: user.org },
  })
})

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password').populate('org')
  if (!user) return res.status(404).json({ error: 'Not found' })
  res.json(user)
})

export default router
