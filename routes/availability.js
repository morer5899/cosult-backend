import express from "express"
import { body, validationResult } from "express-validator" // Import validation tools
import Availability from "../models/Availability.js"
import authMiddleware from "../middlewares/auth.js"

console.log("backend/routes/availability.js loaded.") // Add this line

const router = express.Router()

// @route   GET /api/availability/:consultantId/:date
// @desc    Get availability for a specific consultant on a specific date
// @access  Private (Consultant can view their own, Client can view any consultant's)
router.get("/:consultantId/:date", authMiddleware, async (req, res) => {
  try {
    const { consultantId, date } = req.params
    console.log(`Backend (GET /api/availability): Received params: consultantId=${consultantId}, date=${date}`)

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      console.error("Backend (GET /api/availability): Invalid date format received.")
      return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." })
    }

    if (req.user.id !== consultantId && req.user.role !== "client") {
      console.warn(
        `Backend (GET /api/availability): Access denied for user ${req.user.id} trying to view ${consultantId}'s availability.`,
      )
      return res.status(403).json({ message: "Access denied. Not authorized to view this availability." })
    }

    const queryDate = new Date(date)
    queryDate.setUTCHours(0, 0, 0, 0) // Normalize to start of the day in UTC

    console.log(`Backend (GET /api/availability): Querying for date (UTC start of day): ${queryDate.toISOString()}`)

    const availability = await Availability.findOne({
      consultantId,
      date: queryDate,
    }).select("slots")

    if (!availability) {
      console.log(
        `Backend (GET /api/availability): No availability found for consultant ${consultantId} on ${date}. Returning empty slots.`,
      )
      return res.json({ slots: [] })
    }

    console.log(`Backend (GET /api/availability): Retrieved availability: ${JSON.stringify(availability.slots)}`)
    res.json(availability)
  } catch (err) {
    console.error("Backend (GET /api/availability): Server error:", err.message)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   POST /api/availability
// @desc    Set/Update availability for a consultant on a specific date
// @access  Private (Consultant only)
router.post(
  "/",
  [
    authMiddleware,
    body("consultantId", "Consultant ID is required").notEmpty(),
    body("date", "Date is required and must be a valid date").isISO8601().toDate(),
    body("slots", "Slots must be an array").isArray(),
    body("slots.*.start", "Slot start time is required").notEmpty(),
    body("slots.*.end", "Slot end time is required").notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      console.error("Backend (POST /api/availability): Validation errors:", errors.array())
      return res.status(400).json({ errors: errors.array() })
    }

    const { consultantId, date, slots } = req.body
    console.log(
      `Backend (POST /api/availability): Received body: consultantId=${consultantId}, date=${date}, slots=${JSON.stringify(
        slots,
      )}`,
    )

    if (req.user.id !== consultantId || req.user.role !== "consultant") {
      console.warn(
        `Backend (POST /api/availability): Access denied for user ${req.user.id} trying to set availability for ${consultantId}.`,
      )
      return res.status(403).json({ message: "Access denied. Only consultants can set their own availability." })
    }

    try {
      const availabilityDate = new Date(date)
      availabilityDate.setUTCHours(0, 0, 0, 0) // Normalize to start of the day in UTC

      console.log(
        `Backend (POST /api/availability): Saving for date (UTC start of day): ${availabilityDate.toISOString()}`,
      )

      const updatedAvailability = await Availability.findOneAndUpdate(
        { consultantId, date: availabilityDate },
        { $set: { slots: slots } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )

      console.log(
        `Backend (POST /api/availability): Saved/Updated availability: ${JSON.stringify(updatedAvailability)}`,
      )
      res.json(updatedAvailability)
    } catch (err) {
      console.error("Backend (POST /api/availability): Server error during save:", err.message)
      res.status(500).json({ message: "Server error" })
    }
  },
)

export default router
