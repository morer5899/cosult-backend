import express from "express"
import Razorpay from "razorpay"
import crypto from "crypto"
import Payment from "../models/Payment.js"
import Appointment from "../models/Appointment.js"
import authMiddleware from "../middlewares/auth.js"
import dotenv from "dotenv"
dotenv.config()
const router = express.Router()

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
})

// Create payment order
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { appointmentId } = req.body

    const appointment = await Appointment.findById(appointmentId).populate("consultantId", "name email")

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      })
    }

    if (appointment.clientId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      })
    }

    // Create Razorpay order
    const options = {
      amount: Math.round(appointment.amount * 100), // Amount in paise
      currency: "INR",
      receipt: `appointment_${appointmentId}`,
      notes: {
        appointmentId: appointmentId,
        clientId: req.user.id,
        consultantId: appointment.consultantId._id.toString(),
      },
    }

    const order = await razorpay.orders.create(options)

    // Create payment record
    const payment = new Payment({
      appointmentId,
      clientId: req.user.id,
      consultantId: appointment.consultantId._id,
      amount: appointment.amount,
      razorpayOrderId: order.id,
      status: "pending",
    })

    await payment.save()

    res.json({
      success: true,
      order,
      payment: payment._id,
    })
  } catch (error) {
    console.error("Create order error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// Verify payment
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentId } = req.body

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex")

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      })
    }

    // Update payment record
    const payment = await Payment.findById(paymentId)
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      })
    }

    payment.status = "success"
    payment.razorpayPaymentId = razorpay_payment_id
    payment.razorpaySignature = razorpay_signature
    payment.transactionId = razorpay_payment_id

    await payment.save()

    // Update appointment status
    await Appointment.findByIdAndUpdate(payment.appointmentId, {
      status: "confirmed",
      paymentId: payment._id,
    })

    res.json({
      success: true,
      message: "Payment verified successfully",
    })
  } catch (error) {
    console.error("Verify payment error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// Get payment history
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const query = {}
    if (req.user.role === "client") {
      query.clientId = req.user.id
    } else {
      query.consultantId = req.user.id
    }

    const payments = await Payment.find(query)
      .populate("appointmentId", "date duration")
      .populate("clientId", "name email")
      .populate("consultantId", "name email")
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      payments,
    })
  } catch (error) {
    console.error("Get payment history error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// Webhook for payment updates
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"]
    const body = req.body

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest("hex")

    if (signature !== expectedSignature) {
      return res.status(400).json({ error: "Invalid signature" })
    }

    const event = JSON.parse(body)

    // Handle different webhook events
    switch (event.event) {
      case "payment.captured":
        await handlePaymentCaptured(event.payload.payment.entity)
        break
      case "payment.failed":
        await handlePaymentFailed(event.payload.payment.entity)
        break
      default:
        console.log(`Unhandled event type: ${event.event}`)
    }

    res.json({ received: true })
  } catch (error) {
    console.error("Webhook error:", error)
    res.status(500).json({ error: "Webhook handler failed" })
  }
})

// Helper functions
const handlePaymentCaptured = async (paymentData) => {
  try {
    const payment = await Payment.findOne({ razorpayOrderId: paymentData.order_id })
    if (payment) {
      payment.status = "success"
      payment.razorpayPaymentId = paymentData.id
      await payment.save()

      // Update appointment
      await Appointment.findByIdAndUpdate(payment.appointmentId, {
        status: "confirmed",
      })
    }
  } catch (error) {
    console.error("Handle payment captured error:", error)
  }
}

const handlePaymentFailed = async (paymentData) => {
  try {
    const payment = await Payment.findOne({ razorpayOrderId: paymentData.order_id })
    if (payment) {
      payment.status = "failed"
      await payment.save()
    }
  } catch (error) {
    console.error("Handle payment failed error:", error)
  }
}

export default router
