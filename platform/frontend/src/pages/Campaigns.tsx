import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Plus, Trash2, ExternalLink, Tag, Building2, Calendar, Layers } from 'lucide-react'
import { api } from '../api/client'
import Button from '../components/ui/button'

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    api.campaigns.list().then((data) => {
      setCampaigns(data)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const remove = async (id: string) => {
    if (!confirm('Delete this campaign?')) return
    await api.campaigns.remove(id)
    load()
  }

  const totalCampaigns = campaigns.length
  const recentCampaigns = campaigns.filter(
    (c) => new Date(c.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  ).length

  const uniqueOrgs = new Set(campaigns.map((c) => c.org?.name).filter(Boolean)).size

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and monitor your advertising campaigns</p>
        </div>
        <Link to="/campaigns/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Campaign
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="animate-fade-in-up stagger-1 rounded-xl border border-white/[0.06] bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Layers className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold tracking-tight">{totalCampaigns}</p>
              <p className="text-xs text-muted-foreground">Total Campaigns</p>
            </div>
          </div>
        </div>

        <div className="animate-fade-in-up stagger-2 rounded-xl border border-white/[0.06] bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold tracking-tight">{recentCampaigns}</p>
              <p className="text-xs text-muted-foreground">Created this week</p>
            </div>
          </div>
        </div>

        <div className="animate-fade-in-up stagger-3 rounded-xl border border-white/[0.06] bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold tracking-tight">{uniqueOrgs}</p>
              <p className="text-xs text-muted-foreground">Organizations</p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-white/[0.06] bg-card p-6 animate-pulse">
              <div className="h-5 w-32 bg-muted rounded mb-3" />
              <div className="h-4 w-20 bg-muted rounded mb-4" />
              <div className="h-3 w-40 bg-muted rounded mb-2" />
              <div className="h-3 w-24 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-card flex flex-col items-center justify-center py-20 px-6 animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
            <Layers className="w-8 h-8 text-primary/50" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No campaigns yet</h3>
          <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
            Create your first campaign to start tracking ad performance and serving creatives through the CDN.
          </p>
          <Link to="/campaigns/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Create your first campaign
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map((c, i) => (
            <div
              key={c._id}
              className={`animate-fade-in-up stagger-${(i % 5) + 1} group rounded-xl border border-white/[0.06] bg-card hover:border-white/[0.12] hover:bg-card/80 transition-all duration-300 flex flex-col`}
            >
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    <Tag className="w-3 h-3" />
                    {c.publisherTag}
                  </span>
                </div>

                <h3 className="font-semibold text-foreground mb-3 group-hover:text-primary transition-colors truncate">
                  {c.name}
                </h3>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{c.org?.name || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span>{new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-white/[0.04] flex items-center gap-1 bg-muted/30 rounded-b-xl">
                <Link
                  to={`/campaigns/${c._id}`}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors px-2 py-1.5 rounded-md hover:bg-primary/10 flex-1 justify-center"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Analytics
                </Link>
                <Link
                  to={`/campaigns/${c._id}`}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-muted flex-1 justify-center"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View
                </Link>
                <button
                  onClick={() => remove(c._id)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors px-2 py-1.5 rounded-md hover:bg-destructive/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
