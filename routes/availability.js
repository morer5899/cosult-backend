import express from "express"
import Availability from "../models/Availability.js"
import authMiddleware from "../middlewares/auth.js"

const router = express.Router()

// Set availability (consultant only)
router.post("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "consultant") {
      return res.status(403).json({
        success: false,
        message: "Only consultants can set availability",
      })
    }

    const { availability } = req.body

    // Delete existing availability
    await Availability.deleteMany({ consultantId: req.user.id })

    // Create new availability entries
    const availabilityEntries = availability.map((entry) => ({
      consultantId: req.user.id,
      dayOfWeek: entry.dayOfWeek,
      isAvailable: entry.isAvailable,
      startTime: entry.startTime,
      endTime: entry.endTime,
    }))

    await Availability.insertMany(availabilityEntries)

    res.json({
      success: true,
      message: "Availability updated successfully",
    })
  } catch (error) {
    console.error("Set availability error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// Get availability
router.get("/", authMiddleware, async (req, res) => {
  try {
    const consultantId = req.user.role === "consultant" ? req.user.id : req.query.consultantId

    if (!consultantId) {
      return res.status(400).json({
        success: false,
        message: "Consultant ID is required",
      })
    }

    const availability = await Availability.find({ consultantId }).sort({ dayOfWeek: 1 })

    res.json({
      success: true,
      availability,
    })
  } catch (error) {
    console.error("Get availability error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// Get consultant availability by ID
router.get("/:consultantId", authMiddleware, async (req, res) => {
  try {
    const { consultantId } = req.params

    const availability = await Availability.find({ consultantId }).sort({ dayOfWeek: 1 })

    res.json({
      success: true,
      availability,
    })
  } catch (error) {
    console.error("Get consultant availability error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

export default router
