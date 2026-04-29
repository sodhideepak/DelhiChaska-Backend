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
  addressId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "address"
  },
  addressLine1: { type: String, trim: true },
  addressLine2: { type: String, trim: true },
  city:         { type: String, trim: true },
  state:        { type: String, trim: true },
  zipCode:      { type: String, trim: true },
  country:      { type: String, trim: true },
  location: {
    lat: Number,
    lng: Number
  },
  phone:        { type: String, trim: true },
  instructions: { type: String, trim: true }  // optional, user can still pass this
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