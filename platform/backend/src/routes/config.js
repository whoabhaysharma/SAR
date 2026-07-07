import { Router } from 'express'
import Campaign from '../models/Campaign.js'

const router = Router()

router.get('/:publisherTag', async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ publisherTag: req.params.publisherTag })
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })

    const config = {
      tags: [{ url: campaign.vastTagUrl }],
      renderer: { type: 'vast-video' },
      analytics: {
        endpoint: `${req.protocol}://${req.get('host')}`,
      },
      tag: campaign.publisherTag,
      viewport: { threshold: 0.5 },
      autoplay: true,
      muted: false,
    }

    res.set('Cache-Control', 'public, max-age=86400')
    res.json(config)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
