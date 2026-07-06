import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import Button from '../components/ui/button'
import Input from '../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

export default function SuperAdmin() {
  const [orgs, setOrgs] = useState<any[]>([])
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [error, setError] = useState('')

  const load = () => api.orgs.list().then(setOrgs)
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!name || !slug) return
    try {
      await api.orgs.create({ name, slug })
      setName(''); setSlug(''); setError('')
      load()
    } catch (e: any) { setError(e.message) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this organization?')) return
    await api.orgs.remove(id)
    load()
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Organizations</h2>
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Create Organization</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} className="flex-1 min-w-[160px]" />
            <Input placeholder="Slug" value={slug} onChange={e => setSlug(e.target.value)} className="flex-1 min-w-[120px]" />
            <Button onClick={create}>Create</Button>
          </div>
          {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
        </CardContent>
      </Card>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr><th className="text-left p-3 font-medium">Name</th><th className="text-left p-3 font-medium">Slug</th><th className="text-left p-3 font-medium">Created</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {orgs.map(o => (
              <tr key={o._id} className="border-t">
                <td className="p-3">{o.name}</td>
                <td className="p-3 text-muted-foreground">{o.slug}</td>
                <td className="p-3 text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</td>
                <td className="p-3 flex gap-2">
                  <Link to={`/admin/orgs/${o._id}/users`} className="text-blue-600 hover:underline text-xs">Users</Link>
                  <button onClick={() => remove(o._id)} className="text-red-600 hover:underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {orgs.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No organizations yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
