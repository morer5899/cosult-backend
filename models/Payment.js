import mongoose from "mongoose"

const paymentSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
    },
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
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "USD",
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["razorpay", "stripe", "paypal"],
      default: "razorpay",
    },
    transactionId: {
      type: String,
    },
    razorpayOrderId: {
      type: String,
    },
    razorpayPaymentId: {
      type: String,
    },
    razorpaySignature: {
      type: String,
    },
    refundId: {
      type: String,
    },
    refundAmount: {
      type: Number,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
)

// Index for better query performance
paymentSchema.index({ appointmentId: 1 })
paymentSchema.index({ clientId: 1 })
paymentSchema.index({ consultantId: 1 })
paymentSchema.index({ status: 1 })

export default mongoose.model("Payment", paymentSchema)
