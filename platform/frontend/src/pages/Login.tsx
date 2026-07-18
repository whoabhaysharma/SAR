import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import Button from '../components/ui/button'
import Input from '../components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

export default function Login() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [hasAdmin, setHasAdmin] = useState(true)

  useEffect(() => {
    const t = localStorage.getItem('token')
    if (!t) return setHasAdmin(false)
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${t}` } })
      .then(r => { if (!r.ok) setHasAdmin(false) })
      .catch(() => setHasAdmin(false))
  }, [])

  const login = async () => {
    try {
      const data = await api.login({ email, password })
      localStorage.setItem('token', data.token)
      nav('/')
    } catch (e: any) { setError(e.message) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm mx-4">
        <CardHeader className="text-center">

          <CardTitle className="text-2xl">Analytics Platform</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasAdmin && (
            <p className="text-sm text-muted-foreground text-center">
              No admin found.{' '}
              <Link to="/setup" className="text-foreground underline">Create one</Link>
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} />
          <Button className="w-full" onClick={login}>Sign In</Button>
        </CardContent>
      </Card>
    </div>
  )
}
