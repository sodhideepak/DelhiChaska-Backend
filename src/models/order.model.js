import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "product",
      required: true
    },

    name: {
      type: String,
      required: true
    },

    quantity: {
      type: Number,
      required: true,
      min: 1
    },

    price: {
      type: Number,
      required: true,
      min: 0
    },

    // combo item or addon
    type: {
      type: String,
      enum: ["combo", "addon"],
      required: true
    }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true
    },

    comboId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "combo"
    },

    items: {
      type: [orderItemSchema],
      required: true
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },

    // order lifecycle
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "out_for_delivery",
        "delivered",
        "cancelled"
      ],
      default: "pending"
    },

    // optional delivery info
    deliveryDetails: {
      address: {
        type: String,
        trim: true
      },
      phone: {
        type: String,
        trim: true
      },
      instructions: {
        type: String,
        trim: true
      }
    },

    // payment info
    payment: {
      method: {
        type: String,
        enum: ["cod", "online"],
        default: "cod"
      },
      status: {
        type: String,
        enum: ["pending", "paid", "failed"],
        default: "pending"
      }
    }

  },
  {
    timestamps: true
  }
);

export const Order = mongoose.model("order", orderSchema);