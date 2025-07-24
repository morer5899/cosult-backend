import mongoose from "mongoose"

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["client", "consultant"], default: "client" },
  googleId: { type: String, unique: true, sparse: true },
  isGoogleAuth: { type: Boolean, default: false },
  bio: String,
  specialties: [String],
  hourlyRate: Number,
  timezone: String,
  languages: [String],
  avatar: String,
  phone: String, // Added phone field here
  notifications: {
    // New field for notifications
    emailNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false },
    appointmentReminders: { type: Boolean, default: true },
    marketingEmails: { type: Boolean, default: false },
  },
  privacy: {
    // New field for privacy settings
    profileVisibility: { type: String, enum: ["public", "private"], default: "public" },
    showEmail: { type: Boolean, default: false },
    showPhone: { type: Boolean, default: false },
  },
  createdAt: { type: Date, default: Date.now },
})

export default mongoose.model("User", UserSchema)
