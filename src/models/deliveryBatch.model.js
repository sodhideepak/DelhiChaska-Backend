import mongoose from "mongoose";

// ─────────────────────────────────────────────
// DELIVERY BATCH SCHEMA
// ─────────────────────────────────────────────
const deliveryBatchSchema =
  new mongoose.Schema({

    // ───────────────────────────────────────────
    // ACTIVE DRIVER
    // ───────────────────────────────────────────
    driverId: {

      type:
        mongoose.Schema.Types.ObjectId,

      ref: "employee"
    },

    // ───────────────────────────────────────────
    // HISTORY DRIVER
    // NEVER REMOVED
    // ───────────────────────────────────────────
    assignedToDriverHistory: {

      type:
        mongoose.Schema.Types.ObjectId,

      ref: "employee",

      default: null
    },

    // ───────────────────────────────────────────
    // AREA
    // ───────────────────────────────────────────
    area: {

      type: String,

      required: true,

      lowercase: true,

      trim: true
    },

    // ───────────────────────────────────────────
    // STATUS
    // ───────────────────────────────────────────
    status: {

      type: String,

      enum: [
        "draft",
        "finalized",
        "in_delivery",
        "completed"
      ],

      default: "draft"
    },

    // ───────────────────────────────────────────
    // DRIVER CAN VIEW OR NOT
    // ───────────────────────────────────────────
    viewToDriver: {

      type: Boolean,

      default: false
    },

    // ───────────────────────────────────────────
    // ORDERS
    // ───────────────────────────────────────────
    orders: [

      {
        orderId: {

          type:
            mongoose.Schema.Types.ObjectId,

          ref: "order"
        },

        sequence: {

          type: Number
        }
      }
    ],

    // ───────────────────────────────────────────
    // FINALIZED DATE
    // ───────────────────────────────────────────
    finalizedAt: {

      type: Date,

      default: null
    }

  },

  {
    timestamps: true
  }
);

export const DeliveryBatch =
  mongoose.model(
    "deliverybatch",
    deliveryBatchSchema
  );