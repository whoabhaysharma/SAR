import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import Button from '../components/ui/button'
import Input from '../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

export default function OrgUsers() {
  const { orgId } = useParams()
  const [users, setUsers] = useState<any[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('member')
  const [error, setError] = useState('')

  const load = () => api.users.byOrg(orgId!).then(setUsers)
  useEffect(() => { load() }, [orgId])

  const create = async () => {
    if (!name || !email || !password) return
    try {
      await api.users.create(orgId!, { email, password, name, role })
      setName(''); setEmail(''); setPassword(''); setRole('member'); setError('')
      load()
    } catch (e: any) { setError(e.message) }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this user?')) return
    await api.users.remove(id)
    load()
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Organization Users</h2>
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Add User</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} className="flex-1 min-w-[140px]" />
            <Input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="flex-1 min-w-[180px]" />
            <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="flex-1 min-w-[140px]" />
            <select value={role} onChange={e => setRole(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm flex-1 min-w-[120px]">
              <option value="member">Member</option>
              <option value="org_admin">Org Admin</option>
            </select>
            <Button onClick={create}>Add</Button>
          </div>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr><th className="text-left p-3 font-medium">Name</th><th className="text-left p-3 font-medium">Email</th><th className="text-left p-3 font-medium">Role</th><th className="text-left p-3 font-medium">Created</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u._id} className="border-t">
                <td className="p-3">{u.name}</td>
                <td className="p-3 text-muted-foreground">{u.email}</td>
                <td className="p-3"><span className="text-xs bg-muted px-2 py-0.5 rounded">{u.role}</span></td>
                <td className="p-3 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="p-3">
                  {u.role !== 'org_admin' && (
                    <button onClick={() => remove(u._id)} className="text-muted-foreground hover:text-foreground hover:underline text-xs">Remove</button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No users yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
