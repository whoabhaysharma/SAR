import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import Button from '../components/ui/button'

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const load = () => api.campaigns.list().then(setCampaigns)
  useEffect(() => { load() }, [])

  const remove = async (id: string) => {
    if (!confirm('Delete this campaign?')) return
    await api.campaigns.remove(id)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Campaigns</h2>
        <Link to="/campaigns/new"><Button>+ New Campaign</Button></Link>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr><th className="text-left p-3 font-medium">Name</th><th className="text-left p-3 font-medium">Tag</th><th className="text-left p-3 font-medium">Org</th><th className="text-left p-3 font-medium">Created</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c._id} className="border-t">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3"><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.publisherTag}</code></td>
                <td className="p-3 text-muted-foreground">{c.org?.name || '-'}</td>
                <td className="p-3 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</td>
                <td className="p-3 flex gap-2">
                  <Link to={`/campaigns/${c._id}`} className="text-blue-600 hover:underline text-xs">Analytics</Link>
                  <button onClick={() => remove(c._id)} className="text-red-600 hover:underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No campaigns yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
