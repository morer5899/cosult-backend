import express from "express"
import User from "../models/User.js"
import authMiddleware from "../middlewares/auth.js"
import multer from "multer" // Import multer
import path from "path" // Import path for file extension

const router = express.Router()

// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/") // Files will be saved in the 'uploads' directory
  },
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`)
  },
})

// Create the multer instance
const upload = multer({ storage: storage })

// Get all consultants
router.get("/consultants", async (req, res) => {
  try {
    const consultants = await User.find({ role: "consultant" }).select("-password")
    res.json(consultants)
  } catch (err) {
    console.error(err.message)
    res.status(500).send("Server error")
  }
})

// Get user profile (requires authentication)
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password")
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Ensure user can only view their own profile or if they are an admin/consultant viewing a client
    if (req.user.id !== req.params.id && req.user.role !== "consultant") {
      return res.status(403).json({ message: "Access denied" })
    }

    res.json(user)
  } catch (err) {
    console.error(err.message)
    res.status(500).send("Server error")
  }
})

// Update user profile (requires authentication)
router.put("/:id", authMiddleware, async (req, res) => {
  const { name, bio, specialties, hourlyRate, timezone, languages, phone, notifications, privacy } = req.body

  // Build user object
  const userFields = {}
  if (name !== undefined) userFields.name = name
  if (bio !== undefined) userFields.bio = bio
  if (specialties !== undefined) userFields.specialties = specialties
  if (hourlyRate !== undefined) userFields.hourlyRate = hourlyRate
  if (timezone !== undefined) userFields.timezone = timezone
  if (languages !== undefined) userFields.languages = languages
  if (phone !== undefined) userFields.phone = phone
  if (notifications !== undefined) userFields.notifications = notifications
  if (privacy !== undefined) userFields.privacy = privacy

  try {
    let user = await User.findById(req.params.id)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Ensure user can only update their own profile
    if (user.id !== req.user.id) {
      return res.status(403).json({ message: "Access denied" })
    }

    user = await User.findByIdAndUpdate(req.params.id, { $set: userFields }, { new: true }).select("-password")
    res.json(user)
  } catch (err) {
    console.error(err.message)
    res.status(500).send("Server error")
  }
})

// New route to upload user avatar (requires authentication)
router.put("/:id/avatar", authMiddleware, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" })
    }

    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Ensure user can only update their own avatar
    if (user.id !== req.user.id) {
      return res.status(403).json({ message: "Access denied" })
    }

    const avatarUrl = `${process.env.BACKEND_URL}/uploads/${req.file.filename}`
    user.avatar = avatarUrl
    await user.save()

    res.json({ message: "Avatar updated successfully", avatar: avatarUrl })
  } catch (err) {
    console.error(err.message)
    res.status(500).send("Server error")
  }
})

export default router
