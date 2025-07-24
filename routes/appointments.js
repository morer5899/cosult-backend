import express from "express"
import { body, validationResult } from "express-validator" // Import validation tools
import Appointment from "../models/Appointment.js"
import User from "../models/User.js" // Import User model to check consultant existence
import authMiddleware from "../middlewares/auth.js"

const router = express.Router()

router.post(
  "/",
  [
    authMiddleware,
    body("consultantId", "Consultant ID is required").notEmpty(),
    body("title", "Title is required").notEmpty().trim(),
    body("description", "Description is required").notEmpty().trim(),
    body("date", "Date is required and must be a valid date").isISO8601().toDate(),
    body("time", "Time is required").notEmpty().trim(),
    body("duration", "Duration is required and must be a number").isInt({ min: 15 }),
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Only clients can book appointments" })
    }

    const { consultantId, title, description, date, time, duration } = req.body

    try {
      const consultant = await User.findById(consultantId)
      if (!consultant || consultant.role !== "consultant") {
        return res.status(404).json({ message: "Consultant not found or is not a consultant" })
      }

      const newAppointment = new Appointment({
        clientId: req.user.id, // Client ID from authenticated user
        consultantId,
        title,
        description,
        date,
        time,
        duration,
      })

      const appointment = await newAppointment.save()
      res.status(201).json(appointment)
    } catch (err) {
      console.error(err.message)
      res.status(500).send("Server error")
    }
  },
)

// Get appointments for the authenticated user (client or consultant)
router.get("/user/:userId", authMiddleware, async (req, res) => {
  try {
    // Ensure user can only view their own appointments
    if (req.user.id !== req.params.userId) {
      return res.status(403).json({ message: "Access denied" })
    }

    let appointments
    if (req.user.role === "client") {
      appointments = await Appointment.find({ clientId: req.user.id })
        .populate("consultantId", "name email avatar") // Populate consultant details
        .sort({ date: 1, time: 1 }) // Sort by date and time
    } else {
      // consultant
      appointments = await Appointment.find({ consultantId: req.user.id })
        .populate("clientId", "name email avatar") // Populate client details
        .sort({ date: 1, time: 1 }) // Sort by date and time
    }

    res.json(appointments)
  } catch (err) {
    console.error(err.message)
    res.status(500).send("Server error")
  }
})

// Get a single appointment by ID (requires authentication)
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate("clientId", "name email avatar")
      .populate("consultantId", "name email avatar")

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" })
    }

    // Ensure only involved parties can view the appointment
    if (appointment.clientId.toString() !== req.user.id && appointment.consultantId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Access denied" })
    }

    res.json(appointment)
  } catch (err) {
    console.error(err.message)
    // Handle invalid ID format
    if (err.kind === "ObjectId") {
      return res.status(400).json({ message: "Invalid appointment ID" })
    }
    res.status(500).send("Server error")
  }
})

// Update appointment status (e.g., completed, cancelled - by consultant or client)
router.put(
  "/:id/status",
  [authMiddleware, body("status", "Status is required").notEmpty().isIn(["scheduled", "completed", "cancelled"])],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { status } = req.body

    try {
      const appointment = await Appointment.findById(req.params.id)

      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" })
      }

      // Ensure only involved parties can update status
      if (appointment.clientId.toString() !== req.user.id && appointment.consultantId.toString() !== req.user.id) {
        return res.status(403).json({ message: "Access denied" })
      }

      appointment.status = status
      await appointment.save()
      res.json(appointment)
    } catch (err) {
      console.error(err.message)
      if (err.kind === "ObjectId") {
        return res.status(400).json({ message: "Invalid appointment ID" })
      }
      res.status(500).send("Server error")
    }
  },
)

export default router
