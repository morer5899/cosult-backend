import express from "express"
import Appointment from "../models/Appointment.js"
import User from "../models/User.js"
import authMiddleware from "../middlewares/auth.js"

const router = express.Router()

// Create appointment
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { consultantId, date, duration = 60, notes } = req.body

    // Validate consultant exists
    const consultant = await User.findById(consultantId)
    if (!consultant || consultant.role !== "consultant") {
      return res.status(404).json({
        success: false,
        message: "Consultant not found",
      })
    }

    // Check if slot is available
    const appointmentDate = new Date(date)
    const existingAppointment = await Appointment.findOne({
      consultantId,
      date: appointmentDate,
      status: { $in: ["pending", "confirmed"] },
    })

    if (existingAppointment) {
      return res.status(400).json({
        success: false,
        message: "Time slot is not available",
      })
    }

    // Calculate amount
    const amount = consultant.hourlyRate * (duration / 60)

    // Generate room ID for video call
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const appointment = new Appointment({
      clientId: req.user.id,
      consultantId,
      date: appointmentDate,
      duration,
      notes,
      amount,
      roomId,
    })

    await appointment.save()

    // Populate the appointment with user details
    const populatedAppointment = await Appointment.findById(appointment._id)
      .populate("clientId", "name email avatar")
      .populate("consultantId", "name email avatar specialization")

    res.status(201).json({
      success: true,
      message: "Appointment created successfully",
      appointment: populatedAppointment,
    })
  } catch (error) {
    console.error("Create appointment error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// Get user appointments (for logged-in user)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { status, upcoming } = req.query

    const query = {}
    if (req.user.role === "client") {
      query.clientId = req.user.id
    } else {
      query.consultantId = req.user.id
    }

    if (status) {
      query.status = status
    }

    if (upcoming === "true") {
      query.date = { $gte: new Date() }
    }

    const appointments = await Appointment.find(query)
      .populate("clientId", "name email avatar")
      .populate("consultantId", "name email avatar specialization")
      .sort({ date: 1 })

    res.json({
      success: true,
      appointments,
    })
  } catch (error) {
    console.error("Get appointments error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// Get appointments for a specific user (by user ID)
router.get("/user/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" })
    }
    const query = user.role === "client"
      ? { clientId: userId }
      : { consultantId: userId }

    const appointments = await Appointment.find(query)
      .populate("clientId", "name email avatar")
      .populate("consultantId", "name email avatar specialization")
      .sort({ date: 1 })

    res.json({ success: true, appointments })
  } catch (error) {
    console.error("Get user appointments error:", error)
    res.status(500).json({ success: false, message: "Server error" })
  }
})

// Get appointment by ID
router.get("/stats/:id", authMiddleware, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate("clientId", "name email avatar")
      .populate("consultantId", "name email avatar specialization")

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      })
    }

    // Check if user is authorized to view this appointment
    if (
      appointment.clientId._id.toString() !== req.user.id &&
      appointment.consultantId._id.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this appointment",
      })
    }

    res.json({
      success: true,
      appointment,
    })
  } catch (error) {
    console.error("Get appointment error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// Update appointment status
router.put("/:id/status", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body
    const validStatuses = ["pending", "confirmed", "cancelled", "completed"]

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      })
    }

    const appointment = await Appointment.findById(req.params.id)

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      })
    }

    // Only consultant can confirm appointments, both can cancel
    if (status === "confirmed" && appointment.consultantId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only consultant can confirm appointments",
      })
    }

    if (appointment.clientId.toString() !== req.user.id && appointment.consultantId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this appointment",
      })
    }

    appointment.status = status
    await appointment.save()

    const updatedAppointment = await Appointment.findById(appointment._id)
      .populate("clientId", "name email avatar")
      .populate("consultantId", "name email avatar specialization")

    res.json({
      success: true,
      message: "Appointment status updated",
      appointment: updatedAppointment,
    })
  } catch (error) {
    console.error("Update appointment status error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// Cancel appointment
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      })
    }

    // Check authorization
    if (appointment.clientId.toString() !== req.user.id && appointment.consultantId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to cancel this appointment",
      })
    }

    // Can only cancel pending or confirmed appointments
    if (!["pending", "confirmed"].includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel this appointment",
      })
    }

    appointment.status = "cancelled"
    await appointment.save()

    res.json({
      success: true,
      message: "Appointment cancelled successfully",
    })
  } catch (error) {
    console.error("Cancel appointment error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

export default router
