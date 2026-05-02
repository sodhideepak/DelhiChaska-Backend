import mongoose from "mongoose";

const variantSchema = new mongoose.Schema(
  {
    size: {
      type: String,
      required: true,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    image: { type: String, required: true },
    category: { type: String, required: true, trim: true },
    food_class: { type: String, required: true, trim: true },
    product_type: { type: String, required: true, trim: true },

    variants: {
      type: [variantSchema],
      required: true
    },

    isAvailable: {
      type: Boolean,
      default: true
    },

    // 🔥 AREA FIELD
    areas: {
      type: [String],
      default: [], // empty = available everywhere
      index: true
    }
  },
  { timestamps: true }
);

export const Product = mongoose.model("Product", productSchema);