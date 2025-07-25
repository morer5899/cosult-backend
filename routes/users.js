import express from "express"
import User from "../models/User.js"
import authMiddleware from "../middlewares/auth.js"

const router = express.Router()

// Get all consultants
router.get("/consultants", authMiddleware, async (req, res) => {
  try {
    const consultants = await User.find({ role: "consultant", isActive: true })
      .select("-password")
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      consultants,
    })
  } catch (error) {
    console.error("Get consultants error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// Get user by ID
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.json({
      success: true,
      user,
    })
  } catch (error) {
    console.error("Get user error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// Update user profile
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { name, phone, bio, specialization, experience, hourlyRate } = req.body

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Update basic fields
    user.name = name || user.name
    user.phone = phone || user.phone
    user.bio = bio || user.bio

    // Update consultant-specific fields
    if (user.role === "consultant") {
      user.specialization = specialization || user.specialization
      user.experience = experience || user.experience
      user.hourlyRate = hourlyRate || user.hourlyRate
    }

    await user.save()

    const updatedUser = await User.findById(req.user.id).select("-password")

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    })
  } catch (error) {
    console.error("Update profile error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// Search consultants
router.get("/search/consultants", authMiddleware, async (req, res) => {
  try {
    const { specialization, minRate, maxRate, experience } = req.query

    const query = { role: "consultant", isActive: true }

    if (specialization) {
      query.specialization = { $regex: specialization, $options: "i" }
    }

    if (minRate || maxRate) {
      query.hourlyRate = {}
      if (minRate) query.hourlyRate.$gte = Number.parseFloat(minRate)
      if (maxRate) query.hourlyRate.$lte = Number.parseFloat(maxRate)
    }

    if (experience) {
      query.experience = { $gte: Number.parseInt(experience) }
    }

    const consultants = await User.find(query).select("-password").sort({ hourlyRate: 1 })

    res.json({
      success: true,
      consultants,
    })
  } catch (error) {
    console.error("Search consultants error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

export default router
