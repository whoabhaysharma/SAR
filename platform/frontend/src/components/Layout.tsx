import { Link, useNavigate, useLocation } from 'react-router-dom'
import type { User } from '../App'
import Button from './ui/button'

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation()
  const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to))

  return (
    <Link
      to={to}
      className={`text-sm font-medium transition-colors ${
        active
          ? 'text-primary'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </Link>
  )
}

export default function Layout({ user, setUser, children }: { user: User; setUser: (u: User | null) => void; children: React.ReactNode }) {
  const nav = useNavigate()

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
    nav('/login')
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl">
        <div className="flex items-center justify-between h-14 px-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                  <path d="M12 20V10" />
                  <path d="M18 20V4" />
                  <path d="M6 20v-4" />
                </svg>
              </div>
              <span className="font-bold text-base tracking-tight">
                <span className="text-primary">Ad</span>Bunny
              </span>
            </Link>

            <nav className="flex items-center gap-1">
              <NavLink to="/">Campaigns</NavLink>
              {user.role === 'super_admin' && (
                <NavLink to="/admin/orgs">Organizations</NavLink>
              )}
              {user.org && (user.role === 'org_admin' || user.role === 'super_admin') && (
                <NavLink to={`/admin/orgs/${user.org._id}/users`}>Users</NavLink>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-semibold text-primary">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground leading-tight">{user.name}</span>
                <span className="text-[10px] text-muted-foreground leading-tight uppercase tracking-wider">{user.role.replace('_', ' ')}</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
