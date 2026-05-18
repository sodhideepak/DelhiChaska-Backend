import bcrypt from "bcrypt";
import mongoose from "mongoose";
import Jwt from "jsonwebtoken";

const employeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    password: {
      type: String,
      required: true
    },

    role: {
      type: String,
      enum: [
        "admin",
        "chef",
        "driver",
        "support",
        "kitchen"
      ],
      required: true
    },

    // ─────────────────────────────────────────────
    // ASSIGNED AREA
    // ─────────────────────────────────────────────
    assignedArea: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
      default: null
    },

    // ─────────────────────────────────────────────
    // DRIVER AVAILABILITY
    // ─────────────────────────────────────────────
    isDriverAvailable: {
      type: Boolean,
      default: true
    },

    // ─────────────────────────────────────────────
    // NEXT DELIVERY CONFIG
    // if admin selects this driver
    // for upcoming delivery scheduling
    // ─────────────────────────────────────────────
    upForNextDelivery: {
      type: Boolean,
      default: false
    },

    // ─────────────────────────────────────────────
    // NEXT DELIVERY DATE
    // admin assigned delivery date
    // ─────────────────────────────────────────────
    nextDeliveryDate: {
      type: Date,
      default: null
    },

    // ─────────────────────────────────────────────
    // OPTIONAL NOTES
    // ─────────────────────────────────────────────
    nextDeliveryNotes: {
      type: String,
      trim: true,
      default: ""
    },

    // ─────────────────────────────────────────────
    // EMPLOYEE STATUS
    // ─────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        "not_verified",
        "verified",
        "rejected"
      ],
      default: "not_verified"
    },

    // ─────────────────────────────────────────────
    // PROFILE IMAGE
    // ─────────────────────────────────────────────
    profile_image: {
      type: String,
      default: ""
    }

  },
  {
    timestamps: true
  }
);

// ─────────────────────────────────────────────
// COMPARE PASSWORD
// ─────────────────────────────────────────────
employeeSchema.methods.isPasswordcorrect =
  async function (password) {

    return await bcrypt.compare(
      password,
      this.password
    );
  };

// ─────────────────────────────────────────────
// GENERATE ACCESS TOKEN
// ─────────────────────────────────────────────
employeeSchema.methods.generateAccessToken =
  function () {

    return Jwt.sign(
      {
        _id: this._id,

        email: this.email,

        phone: this.phone,

        role: this.role,

        assignedArea:
          this.assignedArea,

        isDriverAvailable:
          this.isDriverAvailable,

        // ✅ NEW FIELDS
        upForNextDelivery:
          this.upForNextDelivery,

        nextDeliveryDate:
          this.nextDeliveryDate
      },

      process.env.Access_Token_Secret,

      {
        expiresIn:
          process.env.Access_Token_Expiry
      }
    );
  };

// ─────────────────────────────────────────────
// GENERATE REFRESH TOKEN
// ─────────────────────────────────────────────
employeeSchema.methods.generateRefreshToken =
  function () {

    return Jwt.sign(
      {
        _id: this._id
      },

      process.env.Refresh_Token_Secret,

      {
        expiresIn:
          process.env.Refresh_Token_Expiry
      }
    );
  };

export const Employee = mongoose.model(
  "employee",
  employeeSchema
);