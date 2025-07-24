import express from "express"
import Razorpay from "razorpay"
import crypto from "crypto"
import Payment from "../models/Payment.js"
import Appointment from "../models/Appointment.js" // Assuming you have an Appointment model
import authMiddleware from "../middlewares/auth.js"
import dotenv from "dotenv"

dotenv.config()
const router = express.Router()

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
})

// @route   POST /api/payments/create-order
// @desc    Create a new Razorpay order
// @access  Private (client only)
router.post("/create-order", authMiddleware, async (req, res) => {
  const { amount, currency, receipt } = req.body;
  let { appointmentId } = req.body;

  // If it's a temporary ID, store it but don't validate as ObjectId
  const isTempId = appointmentId.startsWith("temp_appointment_id_");
  
  if (!amount || !currency || !receipt || !appointmentId) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const options = {
      amount: amount,
      currency: currency,
      receipt: receipt,
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(options);

    const newPayment = new Payment({
      userId: req.user.id,
      appointmentId: isTempId ? undefined : appointmentId, // Only store if it's a real ID
      tempAppointmentId: isTempId ? appointmentId : undefined, // Store temp ID separately
      razorpayOrderId: order.id,
      amount: amount,
      currency: currency,
      status: "created",
    });

    await newPayment.save();

    res.json({
      orderId: order.id,
      currency: order.currency,
      amount: order.amount,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("Error creating Razorpay order:", err);
    res.status(500).json({ message: "Failed to create order", error: err.message });
  }
});


// Verify payment endpoint
router.post("/verify", authMiddleware, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, appointmentId, amount } = req.body;

  // Validate required fields
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !appointmentId || !amount) {
    return res.status(400).json({ 
      message: "Missing required fields",
      required: ["razorpay_order_id", "razorpay_payment_id", "razorpay_signature", "appointmentId", "amount"]
    });
  }

  try {
    // 1. Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      // Update payment status if exists
      await Payment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        { status: "failed" }
      ).catch(err => console.error("Failed to update payment status:", err));
      
      // Update appointment status
      await Appointment.findByIdAndUpdate(appointmentId, {
        status: "cancelled",
        paymentStatus: "failed",
      }).catch(err => console.error("Failed to update appointment status:", err));
      
      return res.status(400).json({ message: "Invalid signature" });
    }

    // 2. Find the existing payment record (created in create-order)
    const existingPayment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!existingPayment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    // 3. Update payment record
    const payment = await Payment.findByIdAndUpdate(
      existingPayment._id,
      {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: "captured",
      },
      { new: true }
    );

    // 4. Update appointment status
    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      {
        status: "confirmed",
        paymentStatus: "completed",
        paymentId: payment._id,
      },
      { new: true }
    );

    res.json({
      message: "Payment verified successfully",
      payment,
      appointment: updatedAppointment,
    });

  } catch (err) {
    console.error("Payment verification error:", err);
    
    // Try to update status to failed if something went wrong
    try {
      await Appointment.findByIdAndUpdate(appointmentId, {
        status: "cancelled",
        paymentStatus: "failed",
      });
    } catch (updateErr) {
      console.error("Failed to update appointment status:", updateErr);
    }

    res.status(500).json({ 
      message: "Failed to verify payment", 
      error: err.message 
    });
  }
});

// @route   GET /api/payments/history/:userId
// @desc    Get payment history for a user
// @access  Private (user only)
router.get("/history/:userId", authMiddleware, async (req, res) => {
  if (req.user.id !== req.params.userId) {
    return res.status(403).json({ message: "Unauthorized access" })
  }

  try {
    const payments = await Payment.find({ userId: req.params.userId })
      .populate("appointmentId", "title date time") // Populate relevant appointment details
      .sort({ createdAt: -1 }) // Sort by most recent
    res.json(payments)
  } catch (err) {
    console.error("Error fetching payment history:", err.message)
    res.status(500).send("Server error")
  }
})

export default router
