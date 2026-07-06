import mongoose from 'mongoose'

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/analytics-platform'

export async function connectDB() {
  await mongoose.connect(MONGO_URI)
  console.log('[db] connected to MongoDB')
}
