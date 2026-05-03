import mongoose from "mongoose";

const comboSchema = new mongoose.Schema(
  {
    name: String,
    description: String,
    price: Number,

    size: String,

    rules: [
      {
        title: String,
        category: [String],
        quantity: Number,

        isFixed: {
          type: Boolean,
          default: false
        },

        fixedItems: [
          {
            productId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Product"
            },
            quantity: Number
          }
        ],

        isOptional: {
          type: Boolean,
          default: false
        },

        allowCustomSelection: {
          type: Boolean,
          default: true
        }
      }
    ],
    
    image: { type: String  },

    isActive: {
      type: Boolean,
      default: true
    },

    // 🔥 AREA FIELD
    areas: {
      type: [String],
      default: [],
      index: true
    }
  },
  { timestamps: true }
);

export const Combo = mongoose.model("Combo", comboSchema);