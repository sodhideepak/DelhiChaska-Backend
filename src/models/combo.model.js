import mongoose from "mongoose";

const comboRuleSchema = new mongoose.Schema(
    {
        // Category or multiple categories allowed
        category: {
            type: [String], // ["veg_curry"] OR ["paneer", "chicken"]
            required: true
        },

        // How many items user must select
        quantity: {
            type: Number,
            required: true,
            min: 1
        },

        // Whether user needs to select or it's auto (like roti)
        isSelectionRequired: {
            type: Boolean,
            default: true
        },

        // Optional label for frontend (better UX)
        label: {
            type: String,
            trim: true
            // e.g. "Choose 2 Veg Curries"
        }
    },
    { _id: false }
);

const comboSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        description: {
            type: String,
            required: true,
            trim: true
        },

        price: {
            type: Number,
            required: true,
            min: 0
        },

        image: {
            type: String,
            default: ""
        },

        // Size like 16oz / 32oz
        size: {
            type: String,
            trim: true
        },

        // Rule-based structure 🔥
        rules: {
            type: [comboRuleSchema],
            required: true
        },

        // Options for customization
        options: {
            fullyVeg: {
                type: Boolean,
                default: false
            },

            vegReplacement: {
                type: Boolean,
                default: false
            }
        },

        isAvailable: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

export const Combo = mongoose.model("combo", comboSchema);