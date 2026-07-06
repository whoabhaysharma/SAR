import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

export default function CampaignAnalytics() {
  const { id } = useParams()
  const [campaign, setCampaign] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)

  useEffect(() => {
    api.campaigns.get(id!).then(setCampaign)
    api.analytics.summary().then(setSummary).catch(() => {})
  }, [id])

  useEffect(() => {
    if (!campaign) return
    api.analytics.campaign(campaign.publisherTag).then(setEvents).catch(() => {})
  }, [campaign])

  if (!campaign) return <p className="text-muted-foreground p-8 text-center">Loading...</p>

  const byEvent: Record<string, number> = {}
  events.forEach((e: any) => { byEvent[e.event] = (byEvent[e.event] || 0) + parseInt(e.count) })
  const total = events.reduce((s: number, e: any) => s + parseInt(e.count), 0)

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">{campaign.name}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tag: <code className="bg-muted px-1.5 py-0.5 rounded">{campaign.publisherTag}</code>
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card><CardHeader className="p-4"><CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle><p className="text-2xl font-bold mt-1">{total.toLocaleString()}</p></CardHeader></Card>
        {Object.entries(byEvent).map(([ev, count]) => (
          <Card key={ev}><CardHeader className="p-4"><CardTitle className="text-sm font-medium text-muted-foreground capitalize">{ev}</CardTitle><p className="text-2xl font-bold mt-1">{count.toLocaleString()}</p></CardHeader></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Events Over Time</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr><th className="text-left p-3 font-medium">Event</th><th className="text-left p-3 font-medium">Publisher</th><th className="text-left p-3 font-medium">Slot</th><th className="text-left p-3 font-medium">Count</th><th className="text-left p-3 font-medium">Hour</th></tr>
            </thead>
            <tbody>
              {events.slice(0, 100).map((e: any, i: number) => (
                <tr key={i} className="border-t">
                  <td className="p-3">{e.event}</td>
                  <td className="p-3 text-muted-foreground">{e.publisher}</td>
                  <td className="p-3 text-muted-foreground">{e.slot}</td>
                  <td className="p-3">{e.count}</td>
                  <td className="p-3 text-muted-foreground text-xs">{e.hour}</td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No events yet</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {summary && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-base">Global Stats</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Total events across all campaigns: <strong className="text-foreground">{summary.total}</strong></p></CardContent>
        </Card>
      )}
    </div>
  )
}
