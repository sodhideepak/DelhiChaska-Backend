import mongoose from "mongoose";




const addressSchema = new mongoose.Schema(
{
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },

    addressLine1: {
        type: String,
        required: true,
        trim: true
    },

    addressLine2: {
        type: String,
        trim: true
    },

    city: {
        type: String,
        required: true,
        trim: true
    },

    state: {
        type: String,
        required: true,
        trim: true
    },

    zipCode: {
        type: String,
        required: true,
        trim: true
    },

    country: {
        type: String,
        default: "United States"
    },

    location: {
        lat: Number,
        lng: Number
    }

},
{ timestamps: true }
);

export const Address = mongoose.model("address", addressSchema);
