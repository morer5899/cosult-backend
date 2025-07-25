import mongoose from "mongoose"

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["client", "consultant"],
      required: true,
    },
    phone: {
      type: String,
    },
    avatar: {
      type: String,
      default: function () {
        return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(this.name)}`
      },
    },
    // Consultant-specific fields
    specialization: {
      type: String,
      required: function () {
        return this.role === "consultant"
      },
    },
    experience: {
      type: Number,
      required: function () {
        return this.role === "consultant"
      },
    },
    hourlyRate: {
      type: Number,
      required: function () {
        return this.role === "consultant"
      },
    },
    bio: {
      type: String,
    },
    // Google OAuth fields
    googleId: {
      type: String,
      sparse: true,
    },
    isGoogleAuth: {
      type: Boolean,
      default: false,
    },
    // Account status
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
    },
    // Password reset
    resetPasswordToken: String,
    resetPasswordExpires: Date,
  },
  {
    timestamps: true,
  },
)

// Index for better query performance
userSchema.index({ email: 1 })
userSchema.index({ role: 1 })
userSchema.index({ googleId: 1 })

export default mongoose.model("User", userSchema)
