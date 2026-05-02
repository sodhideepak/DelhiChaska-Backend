// models/area.model.js

import mongoose from "mongoose";

const areaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    cities: [
      {
        type: String,
        trim: true
      }
    ],

    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

export const Area = mongoose.model("Area", areaSchema);