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
    const embed = `<div id="ad-container" style="width:640px;height:360px"></div>
<script src="vast-ad-player.js"><\/script>
<script>
  const player = new VastAdPlayer({ container: '#ad-container', tags: [{ url: '${vastTagUrl}' }], autoplay: true, muted: true });
  player.init();
<\/script>`

    return (
      <div className="max-w-2xl">
        <Card>
          <CardHeader><CardTitle>Campaign Created 🎉</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">Publisher Tag: <code className="bg-muted px-2 py-0.5 rounded text-sm">{tag}</code></p>
            <div>
              <p className="text-sm font-medium mb-2">Embed this on your publisher page:</p>
              <pre className="bg-zinc-950 text-zinc-100 p-4 rounded-lg text-xs overflow-x-auto">{embed}</pre>
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
