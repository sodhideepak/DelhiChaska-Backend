import mongoose from "mongoose";

const tempEmployeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },

    phone: {
      type: String,
      required: true,
      trim: true
    },

    password: {
      type: String,
      required: true
    },

    role: {
      type: String,
      enum: ["admin", "chef", "driver", "support"],
      required: true
    },

    status: {
      type: String,
      enum: ["not_verified", "verified", "rejected"],
      default: "not_verified"
    },

    profile_image: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

export const TempEmployee = mongoose.model("tempEmployee", tempEmployeeSchema);
