import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['super_admin', 'org_admin', 'user'], default: 'user' },
  org: { type: mongoose.Schema.Types.ObjectId, ref: 'Org', default: null },
}, { timestamps: true })

export default mongoose.model('User', userSchema)
