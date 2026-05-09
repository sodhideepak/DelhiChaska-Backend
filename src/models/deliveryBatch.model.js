import mongoose from "mongoose";

const deliveryBatchSchema =
  new mongoose.Schema({

    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "employee",
      required: true
    },

    area: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },

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