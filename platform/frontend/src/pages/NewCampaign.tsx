import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import Button from '../components/ui/button'
import Input from '../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

export default function NewCampaign() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [vastTagUrl, setVastTagUrl] = useState('')
  const [tag, setTag] = useState('')
  const [error, setError] = useState('')
  const [created, setCreated] = useState(false)

  const create = async () => {
    if (!name || !vastTagUrl) { setError('Name and VAST tag URL required'); return }
    try {
      const c = await api.campaigns.create({ name, vastTagUrl })
      setTag(c.publisherTag)
      setCreated(true)
    } catch (e: any) { setError(e.message) }
  }

  if (created) {
    const embed = `<script src="https://cdn.adbunny.in/adbunny.js"
  data-api="https://cdn.adbunny.in"
  data-publisher="${tag}"
  data-target="#ad-container"
  data-slot="leaderboard">
<\/script>`

    const copy = (text: string) => navigator.clipboard.writeText(text)

    return (
      <div className="max-w-2xl">
        <Card>
          <CardHeader><CardTitle>Campaign Created</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">Publisher Tag</p>
              <div className="flex items-center gap-2">
                <code className="bg-muted px-2 py-1 rounded text-sm flex-1">{tag}</code>
                <Button onClick={() => copy(tag)}>Copy</Button>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Config URL</p>
              <div className="flex items-center gap-2">
                <code className="bg-muted px-2 py-1 rounded text-sm flex-1">https://cdn.adbunny.in/config/{tag}.json</code>
                <Button onClick={() => copy(`https://cdn.adbunny.in/config/${tag}.json`)}>Copy</Button>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Embed Snippet</p>
              <pre className="bg-zinc-950 text-zinc-100 p-4 rounded-lg text-xs overflow-x-auto">{embed}</pre>
              <Button onClick={() => copy(embed)} className="mt-2">Copy Snippet</Button>
            </div>
            <Button onClick={() => nav('/')}>Back to Campaigns</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      <Card>
        <CardHeader><CardTitle>New Campaign</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Campaign Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Summer Sale 2026" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">VAST Tag URL</label>
            <Input value={vastTagUrl} onChange={e => setVastTagUrl(e.target.value)} placeholder="https://ads.example.com/vast.xml" />
          </div>
          <Button onClick={create}>Create Campaign</Button>
        </CardContent>
      </Card>
    </div>
  )
}
