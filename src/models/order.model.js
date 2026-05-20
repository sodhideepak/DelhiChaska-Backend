import mongoose from "mongoose";

// ─────────────────────────────────────────────
// ORDER ITEM SCHEMA
// ─────────────────────────────────────────────
const orderItemSchema = new mongoose.Schema({

  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId()
  },

  type: {
    type: String,
    enum: [
      "product",
      "combo",
      "addon"
    ],
    required: true
  },

  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product"
  },

  comboId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Combo"
  },

  name: {
    type: String
  },

  quantity: {
    type: Number,
    default: 1
  },

  // ─────────────────────────────────────────────
  // SELECTED VARIANT
  // ─────────────────────────────────────────────
  selectedVariant: {

    size: {
      type: String
    },

    price: {
      type: Number
    }
  },

  // ─────────────────────────────────────────────
  // SUBTOTAL
  // ─────────────────────────────────────────────
  subtotal: {
    type: Number,
    default: 0
  },

  // ─────────────────────────────────────────────
  // CUSTOM SELECTIONS
  // ─────────────────────────────────────────────
  selections: {
    type: Array,
    default: []
  }

}, { _id: false });


// ─────────────────────────────────────────────
// DELIVERY DATE FUNCTION
// ─────────────────────────────────────────────
const getNextDeliveryDate = (
  baseDate = new Date()
) => {

  const deliveryDays = [1];

  const usDate = new Date(
    baseDate.toLocaleString(
      "en-US",
      {
        timeZone:
          "America/Los_Angeles"
      }
    )
  );

  const today =
    usDate.getDay();

  let daysToAdd = null;

  for (
    let i = 1;
    i <= 7;
    i++
  ) {

    const nextDay =
      (today + i) % 7;

    if (
      deliveryDays.includes(nextDay)
    ) {

      daysToAdd = i;
      break;
    }
  }

  const nextDeliveryDate =
    new Date(usDate);

  nextDeliveryDate.setDate(
    usDate.getDate() + daysToAdd
  );

  return nextDeliveryDate;
};


// ─────────────────────────────────────────────
// ORDER SCHEMA
// ─────────────────────────────────────────────
const orderSchema = new mongoose.Schema(
  {
    // ───────────────────────────────────────────
    // USER
    // ───────────────────────────────────────────
    userId: {
      type:
        mongoose.Schema.Types.ObjectId,

      ref: "user",

      required: true
    },

    // ───────────────────────────────────────────
    // ITEMS
    // ───────────────────────────────────────────
    items: {
      type: [orderItemSchema],
      required: true
    },

    // ───────────────────────────────────────────
    // TOTAL
    // ───────────────────────────────────────────
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },

    // ───────────────────────────────────────────
    // ORDER STATUS
    // ───────────────────────────────────────────
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

    // ───────────────────────────────────────────
    // DELIVERY DATE
    // ───────────────────────────────────────────
    deliveryDate: {
      type: Date,
      default: () =>
        getNextDeliveryDate()
    },

    // ───────────────────────────────────────────
    // DELIVERED AT
    // ───────────────────────────────────────────
    deliveredAt: {
      type: Date,
      default: null
    },

    // ───────────────────────────────────────────
    // DELIVERY STATUS
    // ───────────────────────────────────────────
    isorderdelivered: {
      type: Boolean,
      default: false
    },

    // ───────────────────────────────────────────
    // DELIVERY PROOF IMAGE
    // ───────────────────────────────────────────
    deliveryProofImage: {

      type: String,

      default: null
    },

    // ───────────────────────────────────────────
    // DELIVERY DETAILS
    // ───────────────────────────────────────────
    deliveryDetails: {

      addressId: {

        type:
          mongoose.Schema.Types.ObjectId,

        ref: "address"
      },

      addressLine1:
        String,

      addressLine2:
        String,

      city:
        String,

      state:
        String,

      zipCode:
        String,

      country:
        String,

      location: {

        lat:
          Number,

        lng:
          Number
      },

      phone:
        String,

      instructions:
        String
    },

    // ───────────────────────────────────────────
    // PAYMENT
    // ───────────────────────────────────────────
    payment: {

      method: {

        type: String,

        enum: [
          "cod",
          "online",
          "Pay Later"
        ],

        default: "cod"
      },

      status: {

        type: String,

        enum: [
          "pending",
          "paid",
          "failed"
        ],

        default: "pending"
      }
    },

    // ───────────────────────────────────────────
    // DELIVERY ASSIGNMENT
    // ───────────────────────────────────────────
    deliveryAssignment: {

      driverId: {

        type:
          mongoose.Schema.Types.ObjectId,

        ref: "employee",

        default: null
      },
        // ✅ HISTORY DRIVER
  // never removed
  assignedToDriverHistory: {

    type:
      mongoose.Schema.Types.ObjectId,

    ref: "employee",

    default: null
  },

      batchId: {

        type:
          mongoose.Schema.Types.ObjectId,

        ref: "deliverybatch",

        default: null
      },

      deliverySequence: {

        type: Number,

        default: null
      },

      assignedAt: {

        type: Date,

        default: null
      }
    },

    // ───────────────────────────────────────────
    // PAYMENT REQUESTED
    // ───────────────────────────────────────────
    paymentRequested: {

      type: Boolean,

      default: false
    }
  },

  {
    timestamps: true
  }
);


// ─────────────────────────────────────────────
// EXPORT MODEL
// ─────────────────────────────────────────────
export const Order =
  mongoose.model(
    "order",
    orderSchema
  );