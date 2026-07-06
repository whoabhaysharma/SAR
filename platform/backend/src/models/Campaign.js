import mongoose from 'mongoose'

const campaignSchema = new mongoose.Schema({
  org: { type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  vastTagUrl: { type: String, required: true },
  publisherTag: { type: String, required: true, unique: true },
}, { timestamps: true })

export default mongoose.model('Campaign', campaignSchema)
