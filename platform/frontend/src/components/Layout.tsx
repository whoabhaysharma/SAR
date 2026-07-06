import { Link, useNavigate } from 'react-router-dom'
import type { User } from '../App'
import Button from './ui/button'

export default function Layout({ user, setUser, children }: { user: User; setUser: (u: User | null) => void; children: React.ReactNode }) {
  const nav = useNavigate()

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
    nav('/login')
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="h-13 border-b bg-card flex items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-bold text-lg">📊 AP</Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Campaigns</Link>
          {user.role === 'super_admin' && (
            <Link to="/admin/orgs" className="text-sm text-muted-foreground hover:text-foreground">Organizations</Link>
          )}
          {user.org && (user.role === 'org_admin' || user.role === 'super_admin') && (
            <Link to={`/admin/orgs/${user.org._id}/users`} className="text-sm text-muted-foreground hover:text-foreground">Users</Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user.name} <span className="text-xs">({user.role})</span></span>
          <Button variant="outline" size="sm" onClick={logout}>Logout</Button>
        </div>
      </header>
      <main className="p-6 max-w-6xl mx-auto">{children}</main>
    </div>
  )
}
