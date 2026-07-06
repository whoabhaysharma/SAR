import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import { connectDB } from './db.js'
import User from './models/User.js'
import authRoutes from './routes/auth.js'
import orgRoutes from './routes/orgs.js'
import userRoutes from './routes/users.js'
import campaignRoutes from './routes/campaigns.js'
import analyticsRoutes from './routes/analytics.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/orgs', orgRoutes)
app.use('/api/users', userRoutes)
app.use('/api/campaigns', campaignRoutes)
app.use('/api/analytics', analyticsRoutes)

app.post('/api/setup', async (req, res) => {
  const existing = await User.countDocuments({ role: 'super_admin' })
  if (existing > 0) return res.status(400).json({ error: 'Super admin already exists' })

  const { email, password, name } = req.body
  if (!email || !password || !name) return res.status(400).json({ error: 'Email, password, name required' })

  const hash = bcrypt.hashSync(password, 10)
  await User.create({ email, password: hash, name, role: 'super_admin' })
  console.log('[setup] super admin created:', email)
  res.json({ ok: true })
})

app.get('/api/health', (_, res) => res.json({ ok: true }))

async function start() {
  await connectDB()
  app.listen(PORT, () => console.log(`[api] http://localhost:${PORT}`))
}

start()
