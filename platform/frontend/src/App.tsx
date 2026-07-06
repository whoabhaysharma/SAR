import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from './api/client'
import Login from './pages/Login'
import Setup from './pages/Setup'
import Layout from './components/Layout'
import SuperAdmin from './pages/SuperAdmin'
import OrgUsers from './pages/OrgUsers'
import Campaigns from './pages/Campaigns'
import NewCampaign from './pages/NewCampaign'
import CampaignAnalytics from './pages/CampaignAnalytics'

export type User = {
  _id: string
  name: string
  email: string
  role: 'super_admin' | 'org_admin' | 'member'
  org?: { _id: string; name: string; slug: string }
}

function Protected({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const token = localStorage.getItem('token')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setLoading(false); return }
    api.me().then(setUser).catch(() => localStorage.removeItem('token')).finally(() => setLoading(false))
  }, [token])

  if (!token) return <Navigate to="/login" />
  if (loading) return <div style={styles.loading}>Loading...</div>
  if (!user) return <Navigate to="/login" />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" />

  return <Layout user={user} setUser={setUser}>{children}</Layout>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/" element={<Protected><Campaigns /></Protected>} />
      <Route path="/campaigns/new" element={<Protected><NewCampaign /></Protected>} />
      <Route path="/campaigns/:id" element={<Protected><CampaignAnalytics /></Protected>} />
      <Route path="/admin/orgs" element={<Protected roles={['super_admin']}><SuperAdmin /></Protected>} />
      <Route path="/admin/orgs/:orgId/users" element={<Protected roles={['super_admin', 'org_admin']}><OrgUsers /></Protected>} />
    </Routes>
  )
}

const styles = {
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#666', fontFamily: 'sans-serif' },
} as const
