import mongoose from "mongoose"
import bcrypt from "bcryptjs"
import User from "../models/User.js"
import dotenv from "dotenv"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: resolve(__dirname, "../.env") })

const seedUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/video-consultation")

    // Clear existing users
    await User.deleteMany({})

    // Hash password for demo accounts
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash("demo123", salt)

    // Create demo users
    const demoUsers = [
      {
        name: "Demo Consultant",
        email: "consultant@demo.com",
        password: hashedPassword,
        role: "consultant",
        bio: "Experienced business consultant with 10+ years of experience",
        specialties: ["Business Strategy", "Marketing", "Financial Planning"],
        hourlyRate: 100,
        timezone: "UTC",
        languages: ["English"],
        avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Demo Consultant",
        notifications: {
          emailNotifications: true,
          appointmentReminders: true,
        },
        privacy: {
          profileVisibility: "public",
        },
      },
      {
        name: "Demo Client",
        email: "client@demo.com",
        password: hashedPassword,
        role: "client",
        bio: "Looking for business consultation",
        avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Demo Client",
        notifications: {
          emailNotifications: true,
          appointmentReminders: true,
        },
        privacy: {
          profileVisibility: "private",
        },
      },
    ]

    await User.insertMany(demoUsers)
    console.log("Demo users created successfully!")
    console.log("Consultant: consultant@demo.com / demo123")
    console.log("Client: client@demo.com / demo123")

    process.exit(0)
  } catch (error) {
    console.error("Error seeding data:", error)
    process.exit(1)
  }
}

seedUsers()
