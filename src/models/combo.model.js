import mongoose from "mongoose";

const comboSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,

  size: {
    type: String, // "16oz", "32oz"
  },

  rules: [
    {
      title: String, // "Rotis", "Veg Curries", etc

      category: [String], 
      // e.g. ["roti"] OR ["veg"] OR ["paneer", "chicken"]

      quantity: Number, // how many user must select

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

  isActive: {
    type: Boolean,
    default: true
  }

}, { timestamps: true });

export const Combo = mongoose.model("Combo", comboSchema);