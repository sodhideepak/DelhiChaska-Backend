import mongoose from "mongoose";

// ─────────────────────────────────────────────
// CART ITEM SCHEMA
// ─────────────────────────────────────────────
const cartItemSchema = new mongoose.Schema(

  {

    itemId: {

      type: mongoose.Schema.Types.ObjectId,

      required: true
    },

    // =====================================================
    // ITEM TYPE
    // =====================================================
    type: {

      type: String,

      enum: ["product", "combo"],

      required: true
    },

    // =====================================================
    // PRODUCT
    // =====================================================
    productId: {

      type:
        mongoose.Schema.Types.ObjectId,

      ref: "Product",

      default: null
    },

    // =====================================================
    // COMBO
    // =====================================================
    comboId: {

      type:
        mongoose.Schema.Types.ObjectId,

      ref: "Combo",

      default: null
    },

    // =====================================================
    // NAME
    // =====================================================
    name: {

      type: String,

      default: ""
    },

    // =====================================================
    // QUANTITY
    // =====================================================
    quantity: {

      type: Number,

      default: 1
    },

    // =====================================================
    // ✅ SELECTED VARIANT
    // =====================================================
    selectedVariant: {

      size: {

        type: String,

        default: ""
      },

      price: {

        type: Number,

        default: 0
      }
    },

    // =====================================================
    // ✅ SUBTOTAL
    // =====================================================
    subtotal: {

      type: Number,

      default: 0
    },

    // =====================================================
    // COMBO SELECTIONS
    // =====================================================
    selections: [

      {

        ruleId:
          mongoose.Schema.Types.ObjectId,

        products: [

          {

            productId:
              mongoose.Schema.Types.ObjectId,

            quantity: Number
          }
        ]
      }
    ]
  },

  {
    _id: false
  }
);

// ─────────────────────────────────────────────
// CART SCHEMA
// ─────────────────────────────────────────────
const cartSchema = new mongoose.Schema(

  {

    user: {

      type:
        mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true
    },

    items: {

      type: [cartItemSchema],

      default: []
    }
  },

  {
    timestamps: true
  }
);

export const Cart =
  mongoose.model(
    "Cart",
    cartSchema
  );