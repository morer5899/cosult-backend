import mongoose from "mongoose"

const appointmentSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    consultantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
      default: 60, // minutes
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
    },
    notes: {
      type: String,
    },
    meetingLink: {
      type: String,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
    amount: {
      type: Number,
      required: true,
    },
    // Video call room ID
    roomId: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
)

// Index for better query performance
appointmentSchema.index({ clientId: 1, date: 1 })
appointmentSchema.index({ consultantId: 1, date: 1 })
appointmentSchema.index({ status: 1 })

export default mongoose.model("Appointment", appointmentSchema)
