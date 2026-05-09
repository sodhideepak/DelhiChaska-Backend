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

    type: {
      type: String,
      enum: ["combo", "addon"],
      required: true
    }
  },
  { _id: false }
);

// ─────────────────────────────────────────────
// ✅ REUSABLE DELIVERY DATE FUNCTION
// ─────────────────────────────────────────────
const getNextDeliveryDate = (baseDate = new Date()) => {

  const deliveryDays = [1]; // Monday

  const usDate = new Date(
    baseDate.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles"
    })
  );

  const today = usDate.getDay();

  let daysToAdd = null;

  for (let i = 1; i <= 7; i++) {

    const nextDay = (today + i) % 7;

    if (deliveryDays.includes(nextDay)) {
      daysToAdd = i;
      break;
    }
  }

  const nextDeliveryDate = new Date(usDate);

  nextDeliveryDate.setDate(usDate.getDate() + daysToAdd);

  return nextDeliveryDate;
};

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

    // ✅ expected delivery date
    deliveryDate: {
      type: Date,
      default: () => getNextDeliveryDate()
    },

    // ✅ actual delivered timestamp
    deliveredAt: {
      type: Date,
      default: null
    },

    deliveryDetails: {
      addressId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "address"
      },

      addressLine1: String,
      addressLine2: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,

      location: {
        lat: Number,
        lng: Number
      },

      phone: String,
      instructions: String
    },

    payment: {
      method: {
        type: String,
        enum: ["cod", "online", "Pay Later"],
        default: "cod"
      },

      status: {
        type: String,
        enum: ["pending", "paid", "failed"],
        default: "pending"
      }
    },

 
  paymentRequested: {
  type: Boolean,
  default: false  
  }
 



  },
  

  {
    timestamps: true
  }
);



export const Order = mongoose.model("order", orderSchema);