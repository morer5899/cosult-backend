import mongoose from "mongoose"

const availabilitySchema = new mongoose.Schema({
  consultantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  slots: [
    {
      start: {
        type: String, // e.g., "09:00"
        required: true,
      },
      end: {
        type: String, // e.g., "10:00"
        required: true,
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

// Add a compound unique index to ensure only one availability entry per consultant per day
availabilitySchema.index({ consultantId: 1, date: 1 }, { unique: true })

// Check if the model already exists before defining it
let Availability;
if (mongoose.models.Availability) {
  Availability = mongoose.models.Availability;
  console.log("Mongoose: Availability model already exists.");
} else {
  Availability = mongoose.model("Availability", availabilitySchema);
  console.log("Mongoose: Availability model defined for the first time.");
}

export default Availability
