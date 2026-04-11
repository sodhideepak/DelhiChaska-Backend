import mongoose from "mongoose";


// ==============================
// 📦 COMBO ITEM
// ==============================
const comboItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "product",
      required: true
    },

    name: String,
    category: String,

    quantity: {
      type: Number,
      required: true,
      min: 1
    },

    price: {
      type: Number,
      required: true
    }
  },
  { _id: false }
);


// ==============================
// 🍱 COMBO STRUCTURE
// ==============================
const comboSchema = new mongoose.Schema(
  {
    comboId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "combo",
      required: true
    },

    name: String,

    items: [comboItemSchema],

    price: {
      type: Number,
      required: true
    }
  },
  { _id: false }
);


// ==============================
// ➕ ADD-ON ITEM
// ==============================
const addOnSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "product",
      required: true
    },

    name: String,

    quantity: {
      type: Number,
      required: true,
      min: 1
    },

    price: {
      type: Number,
      required: true
    }
  },
  { _id: false }
);


// ==============================
// 🛒 CART
// ==============================
const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      unique: true
    },

    combo: comboSchema,

    addOns: {
      type: [addOnSchema],
      default: []
    },

    totalAmount: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

export const Cart = mongoose.model("cart", cartSchema);