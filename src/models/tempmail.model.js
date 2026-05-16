import mongoose from "mongoose";

const tempEmailSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },

    new_email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    otp: {
      type: String,
      required: true,
    },

    otp_expiry: {
      type: Date,
      required: true,
    },

    is_verified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const TempEmail = mongoose.model(
  "TempEmail",
  tempEmailSchema
);