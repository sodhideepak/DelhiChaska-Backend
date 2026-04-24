import mongoose from "mongoose";

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  items: [
    {
       itemId: {
        type: mongoose.Schema.Types.ObjectId, // or String if you prefer
        required: true
      },
      type: {
        type: String, // "product" or "combo"
        enum: ["product", "combo"],
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

      quantity: {
        type: Number,
        default: 1
      },

      // 🔥 For combos
      selections: [
        {
          ruleId: mongoose.Schema.Types.ObjectId,
          products: [
            {
              productId: mongoose.Schema.Types.ObjectId,
              quantity: Number
            }
          ]
        }
      ]
    }
  ]
}, { timestamps: true });

export const Cart = mongoose.model("Cart", cartSchema);