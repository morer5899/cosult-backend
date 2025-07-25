import mongoose from "mongoose"

const availabilitySchema = new mongoose.Schema(
  {
    consultantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    dayOfWeek: {
      type: String,
      enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      required: true,
    },
    isAvailable: {
      type: Boolean,
      default: false,
    },
    startTime: {
      type: String,
      required: function () {
        return this.isAvailable
      },
    },
    endTime: {
      type: String,
      required: function () {
        return this.isAvailable
      },
    },
  },
  {
    timestamps: true,
  },
)

// Index for better query performance
availabilitySchema.index({ consultantId: 1, dayOfWeek: 1 })

export default mongoose.model("Availability", availabilitySchema)
