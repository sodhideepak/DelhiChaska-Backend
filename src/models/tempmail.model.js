// models/tempEmailUpdate.model.js

import mongoose from "mongoose";

const tempEmailUpdateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true
    },

    oldEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },

    newEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },

    otp: {
      type: String,
      required: true
    },

    expiresAt: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// auto delete after expiry
tempEmailUpdateSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

export const TempEmailUpdate = mongoose.model(
  "TempEmailUpdate",
  tempEmailUpdateSchema
);